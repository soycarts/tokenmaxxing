import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isFile } from './fsutil.js';
import { home, tmxHome } from './paths.js';
import { confirm, lineDiff } from './prompt.js';

export const LABEL = 'fyi.tokenmaxxing.sync';
const CRON_MARK = '# tokenmaxxing sync';
const INTERVAL_S = 30 * 60;

function nodeBinDir(): string {
  return dirname(process.execPath);
}

function npxPath(): string {
  const p = join(nodeBinDir(), 'npx');
  return isFile(p) ? p : 'npx';
}

export function plistPath(): string {
  return join(home(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function launchdPlist(npx: string, binDir: string, tmx: string, envHome?: string): string {
  const args = [npx, '-y', 'tokenmaxxing-cli', 'sync', '--quiet'];
  const env: Record<string, string> = { PATH: `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin` };
  if (envHome) env.TOKENMAXXING_HOME = envHome;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${esc(a)}</string>`).join('\n')}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${Object.entries(env)
  .map(([k, v]) => `    <key>${esc(k)}</key>\n    <string>${esc(v)}</string>`)
  .join('\n')}
  </dict>
  <key>StartInterval</key>
  <integer>${INTERVAL_S}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${esc(join(tmx, 'schedule.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${esc(join(tmx, 'schedule.log'))}</string>
</dict>
</plist>
`;
}

export function cronLine(npx: string, binDir: string, envHome?: string): string {
  const envs = [`PATH=${binDir}:/usr/bin:/bin`, ...(envHome ? [`TOKENMAXXING_HOME=${envHome}`] : [])].join(' ');
  return `*/30 * * * * ${envs} ${npx} -y tokenmaxxing-cli sync --quiet >/dev/null 2>&1 ${CRON_MARK}`;
}

function readCrontab(): string {
  const r = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout : '';
}

function writeCrontab(text: string): void {
  execFileSync('crontab', ['-'], { input: text });
}

export async function scheduleCommand(sub: string | undefined, opts: { yes: boolean }, log = console.log): Promise<number> {
  const envHome = process.env.TOKENMAXXING_HOME;
  if (process.platform === 'darwin') {
    const path = plistPath();
    const exists = isFile(path);
    if (sub === 'status' || sub === undefined) {
      log(`launchd agent ${LABEL}: ${exists ? 'installed' : 'not installed'}  (${path})`);
      if (sub === undefined) log('\nUsage: tokenmaxxing schedule install|uninstall [--yes]');
      return 0;
    }
    const uid = process.getuid?.() ?? 0;
    if (sub === 'install') {
      const body = launchdPlist(npxPath(), nodeBinDir(), tmxHome(), envHome);
      const before = exists ? readFileSync(path, 'utf8') : '';
      if (before === body) {
        log(`Already installed: ${path}`);
        return 0;
      }
      log(`Will write ${path} (runs \`tokenmaxxing sync\` every 30 min) and load it with launchctl:\n`);
      log(lineDiff(before, body));
      if (!(opts.yes || (await confirm('Install?')))) {
        log('Nothing was changed. Re-run with --yes to apply.');
        return 1;
      }
      mkdirSync(dirname(path), { recursive: true });
      mkdirSync(tmxHome(), { recursive: true });
      if (exists) spawnSync('launchctl', ['bootout', `gui/${uid}`, path], { stdio: 'ignore' });
      writeFileSync(path, body);
      const r = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, path], { encoding: 'utf8' });
      if (r.status !== 0) log(`launchctl bootstrap failed (${(r.stderr || '').trim()}); the agent will load at next login.`);
      log(`Installed ${path}`);
      return 0;
    }
    if (sub === 'uninstall') {
      if (!exists) {
        log('Not installed.');
        return 0;
      }
      if (!(opts.yes || (await confirm(`Unload and delete ${path}?`)))) {
        log('Nothing was changed. Re-run with --yes to apply.');
        return 1;
      }
      spawnSync('launchctl', ['bootout', `gui/${uid}`, path], { stdio: 'ignore' });
      rmSync(path, { force: true });
      log(`Removed ${path}`);
      return 0;
    }
  } else if (process.platform === 'linux') {
    const current = readCrontab();
    const has = current.split('\n').some((l) => l.includes(CRON_MARK));
    if (sub === 'status' || sub === undefined) {
      log(`cron entry: ${has ? 'installed' : 'not installed'}`);
      return 0;
    }
    let next: string;
    if (sub === 'install') {
      if (has) {
        log('Already installed.');
        return 0;
      }
      next = (current && !current.endsWith('\n') ? current + '\n' : current) + cronLine(npxPath(), nodeBinDir(), envHome) + '\n';
    } else if (sub === 'uninstall') {
      if (!has) {
        log('Not installed.');
        return 0;
      }
      next = current
        .split('\n')
        .filter((l) => !l.includes(CRON_MARK))
        .join('\n');
    } else {
      log('Usage: tokenmaxxing schedule install|uninstall [--yes]');
      return 1;
    }
    log('crontab change:\n' + lineDiff(current, next));
    if (!(opts.yes || (await confirm('Apply?')))) {
      log('Nothing was changed. Re-run with --yes to apply.');
      return 1;
    }
    writeCrontab(next);
    log(sub === 'install' ? 'Installed cron entry.' : 'Removed cron entry.');
    return 0;
  } else {
    log(`schedule is supported on macOS (launchd) and Linux (cron); on ${process.platform} use your OS scheduler to run \`npx -y tokenmaxxing-cli sync --quiet\` every 30 minutes.`);
    return 1;
  }
  log('Usage: tokenmaxxing schedule install|uninstall [--yes]');
  return 1;
}
