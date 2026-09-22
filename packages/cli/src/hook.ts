import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isDir, isFile } from './fsutil.js';
import { claudeCandidateRoots, codexHome, home } from './paths.js';
import { confirm, lineDiff } from './prompt.js';

export const HOOK_COMMAND = 'npx -y tokenmaxxing-cli sync --quiet';
export const CODEX_NOTIFY_LINE = 'notify = ["npx","-y","tokenmaxxing-cli","sync","--quiet"]';
const BACKUP_SUFFIX = '.tokenmaxxing.bak';

export function claudeSettingsPath(): string {
  const env = process.env.CLAUDE_CONFIG_DIR;
  const root = env && env.trim() ? env.split(',')[0].trim() : claudeCandidateRoots().at(-1) ?? join(home(), '.claude');
  return join(root, 'settings.json');
}

export function codexConfigPath(): string {
  return join(codexHome(), 'config.toml');
}

function isOurEntry(e: any): boolean {
  return (
    !!e &&
    Array.isArray(e.hooks) &&
    e.hooks.some((h: any) => h && h.type === 'command' && h.command === HOOK_COMMAND)
  );
}

export function claudeHasHook(settings: any): boolean {
  const stop = settings?.hooks?.Stop;
  return Array.isArray(stop) && stop.some(isOurEntry);
}

function detectIndent(text: string): number | string {
  const m = /\n([ \t]+)"/.exec(text);
  if (!m) return 2;
  return m[1].includes('\t') ? '\t' : m[1].length;
}

export function addClaudeHook(settings: any): any {
  const next = structuredClone(settings ?? {});
  if (!next.hooks || typeof next.hooks !== 'object') next.hooks = {};
  if (!Array.isArray(next.hooks.Stop)) next.hooks.Stop = [];
  next.hooks.Stop.push({ matcher: '', hooks: [{ type: 'command', command: HOOK_COMMAND }] });
  return next;
}

/** Remove exactly the entry `install` added (and containers left empty by that removal). */
export function removeClaudeHook(settings: any): any {
  const next = structuredClone(settings ?? {});
  const stop = next?.hooks?.Stop;
  if (!Array.isArray(stop)) return next;
  next.hooks.Stop = stop.filter(
    (e: any) => !(isOurEntry(e) && e.hooks.length === 1 && (e.matcher === '' || e.matcher === undefined)),
  );
  // If our command was merged into a larger entry by hand, drop only our command from it.
  next.hooks.Stop = next.hooks.Stop.filter((e: any) => {
    if (!isOurEntry(e)) return true;
    e.hooks = e.hooks.filter((h: any) => !(h?.type === 'command' && h.command === HOOK_COMMAND));
    return e.hooks.length > 0;
  });
  if (!next.hooks.Stop.length) delete next.hooks.Stop;
  if (!Object.keys(next.hooks).length) delete next.hooks;
  return next;
}

const NOTIFY_KEY = /^\s*notify\s*=/m;

export function codexHasNotify(toml: string): boolean {
  return NOTIFY_KEY.test(toml);
}
export function codexHasOurNotify(toml: string): boolean {
  return toml.split('\n').some((l) => l.trim() === CODEX_NOTIFY_LINE);
}

/** Insert the top-level `notify` key before the first [table] so TOML keeps it at the root. */
export function addCodexNotify(toml: string): string {
  const lines = toml === '' ? [] : toml.split('\n');
  const idx = lines.findIndex((l) => /^\s*\[/.test(l));
  const insert = ['# added by `tokenmaxxing hook install` (remove with `tokenmaxxing hook uninstall`)', CODEX_NOTIFY_LINE];
  if (idx === -1) {
    const body = toml === '' || toml.endsWith('\n') ? toml : toml + '\n';
    return body + insert.join('\n') + '\n';
  }
  lines.splice(idx, 0, ...insert, '');
  return lines.join('\n');
}

export function removeCodexNotify(toml: string): string {
  const lines = toml.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === CODEX_NOTIFY_LINE) {
      if (out.length && out[out.length - 1].startsWith('# added by `tokenmaxxing hook install`')) out.pop();
      if (lines[i + 1] === '' && /^\s*\[/.test(lines[i + 2] ?? '')) i++; // blank line install added
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

interface Edit {
  label: string;
  path: string;
  before: string;
  after: string;
}

function readText(path: string): string {
  return isFile(path) ? readFileSync(path, 'utf8') : '';
}

function planClaude(action: 'install' | 'uninstall', log: (s: string) => void): Edit | null {
  const path = claudeSettingsPath();
  if (!isDir(dirname(path))) {
    log(`Claude Code: ${dirname(path)} not found — skipped.`);
    return null;
  }
  const before = readText(path);
  let obj: any = {};
  try {
    obj = before.trim() ? JSON.parse(before) : {};
  } catch {
    log(`Claude Code: ${path} is not valid JSON — not touching it.`);
    return null;
  }
  const has = claudeHasHook(obj);
  if (action === 'install' && has) {
    log(`Claude Code: Stop hook already installed in ${path}.`);
    return null;
  }
  if (action === 'uninstall' && !has) {
    log(`Claude Code: no tokenmaxxing Stop hook in ${path}.`);
    return null;
  }
  const next = action === 'install' ? addClaudeHook(obj) : removeClaudeHook(obj);
  const after = JSON.stringify(next, null, detectIndent(before)) + '\n';
  return { label: 'Claude Code', path, before, after };
}

function planCodex(action: 'install' | 'uninstall', log: (s: string) => void): Edit | null {
  const path = codexConfigPath();
  if (!isDir(dirname(path))) {
    log(`Codex: ${dirname(path)} not found — skipped.`);
    return null;
  }
  const before = readText(path);
  if (action === 'install') {
    if (codexHasOurNotify(before)) {
      log(`Codex: notify hook already installed in ${path}.`);
      return null;
    }
    if (codexHasNotify(before)) {
      log(
        `Codex: ${path} already has a \`notify\` command, so tokenmaxxing will not edit it.\n` +
          `  To sync after Codex turns too, make your notify program also run:  ${HOOK_COMMAND}`,
      );
      return null;
    }
    return { label: 'Codex', path, before, after: addCodexNotify(before) };
  }
  if (!codexHasOurNotify(before)) {
    log(`Codex: no tokenmaxxing notify hook in ${path}.`);
    return null;
  }
  return { label: 'Codex', path, before, after: removeCodexNotify(before) };
}

export async function hookCommand(sub: string | undefined, opts: { yes: boolean }, log = console.log): Promise<number> {
  if (sub === 'status' || sub === undefined) {
    const cp = claudeSettingsPath();
    let claudeOn = false;
    try {
      claudeOn = claudeHasHook(JSON.parse(readText(cp) || '{}'));
    } catch {
      /* invalid json */
    }
    const xp = codexConfigPath();
    const t = readText(xp);
    log(`Claude Code Stop hook: ${claudeOn ? 'installed' : 'not installed'}  (${cp})`);
    log(
      `Codex notify hook:     ${codexHasOurNotify(t) ? 'installed' : codexHasNotify(t) ? 'not installed (another notify command is configured)' : 'not installed'}  (${xp})`,
    );
    if (sub === undefined) log('\nUsage: tokenmaxxing hook install|uninstall|status [--yes]');
    return 0;
  }
  if (sub !== 'install' && sub !== 'uninstall') {
    log('Usage: tokenmaxxing hook install|uninstall|status [--yes]');
    return 1;
  }
  const edits = [planClaude(sub, log), planCodex(sub, log)].filter((e): e is Edit => !!e);
  if (!edits.length) return 0;
  for (const e of edits) {
    log(`\n${e.label}: ${e.before ? 'edit' : 'create'} ${e.path}`);
    log(lineDiff(e.before, e.after));
  }
  log('');
  const ok = opts.yes || (await confirm(`Apply ${edits.length === 1 ? 'this change' : 'these changes'}?`));
  if (!ok) {
    log(process.stdin.isTTY ? 'Aborted — nothing was changed.' : 'Nothing was changed. Re-run with --yes to apply.');
    return opts.yes ? 0 : 1;
  }
  for (const e of edits) {
    if (sub === 'install' && e.before) copyFileSync(e.path, e.path + BACKUP_SUFFIX);
    mkdirSync(dirname(e.path), { recursive: true });
    writeFileSync(e.path, e.after);
    log(`${sub === 'install' ? 'Installed' : 'Removed'}: ${e.path}${sub === 'install' && e.before ? `  (backup: ${e.path + BACKUP_SUFFIX})` : ''}`);
  }
  return 0;
}
