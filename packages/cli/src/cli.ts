#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { configExists, loadConfig, saveConfig, type Config } from './config.js';
import { isGranularity } from './config.js';
import { detect, detectionToSources } from './detect.js';
import { doctor } from './doctor.js';
import { fmtInt, fmtPrice, table } from './format.js';
import { hookCommand } from './hook.js';
import { parsePeriod } from './period.js';
import {
  addLine, CUSTOM, describeLines, isProvider, lineName, parsePlanSpec, planTable, plansMonthly, PROVIDERS, providerMonthly, unitPrice,
  type PlanLine,
} from './plans.js';
import { buildReport, renderReport, reportJson, type GroupBy } from './report.js';
import { scheduleCommand } from './schedule.js';
import { link, push, SiteError } from './site.js';
import { loadBuckets } from './store.js';
import { sync, type SyncResult } from './sync.js';
import { compare, ccusageTotals, ourTotals, runCcusage } from './verify.js';
import { SOURCES } from './types.js';

const VERSION: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const HELP = `tokenmaxxing ${VERSION} — API-equivalent value of your AI coding subscriptions, from local logs.

Usage: tokenmaxxing <command> [options]

  init                               detect tools, write config, first sync, print report
  sync [--quiet]                     incremental parse of all detected sources
  report [--since 7d|30d|YYYY-MM-DD] [--json] [--by model|source|day]
  plan set <provider> <plan> [xN]    replace a provider's plans, e.g. plan set claude max-20x x5 · plan set openai pro
  plan add <provider> <plan> [xN]    add a line, e.g. plan add claude pro · plan add openai custom 100 "Codex $100"
  plan remove <provider> [<plan>]    remove one line, or all of a provider's plans (plan set <provider> none also clears)
  plan list
  verify [--since 30d]               compare Claude totals with ccusage (if installed)
  link [--site URL]                  connect this machine to tokenmaxxing.fyi
  push [--site URL] [--dry-run] [--all] [--granularity hour|day|week]
                                     upload bucket rows (opt-in); prints what is sent; --all resends everything
  granularity [set hour|day|week]    how coarse uploaded rows are (default hour; day/week hide your working hours)
  hook install|uninstall|status [--yes]      opt-in Claude Code Stop / Codex notify hook
  schedule install|uninstall|status [--yes]  run sync every 30 min (launchd / cron)
  doctor                             paths, files scanned, cursor state, pricing snapshot
  --version

Data lives in ~/.tokenmaxxing (override with TOKENMAXXING_HOME). No telemetry.`;

interface Args {
  cmd?: string;
  pos: string[];
  flags: Record<string, string | boolean>;
}

const VALUE_FLAGS = new Set(['since', 'by', 'site', 'qty']);

export function parseArgs(argv: string[]): Args {
  const out: Args = { pos: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h') out.flags.help = true;
    else if (a === '-v') out.flags.version = true;
    else if (a === '-y') out.flags.yes = true;
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq === -1 ? a.slice(2) : a.slice(2, eq);
      if (eq !== -1) out.flags[name] = a.slice(eq + 1);
      else if (VALUE_FLAGS.has(name) && i + 1 < argv.length && !argv[i + 1].startsWith('--')) out.flags[name] = argv[++i];
      else out.flags[name] = true;
    } else if (!out.cmd) out.cmd = a;
    else out.pos.push(a);
  }
  return out;
}

const str = (v: string | boolean | undefined) => (typeof v === 'string' ? v : undefined);

function syncSummary(r: SyncResult): string {
  const parts = Object.entries(r.perSource).map(
    ([s, st]) => `${s} ${fmtInt(st!.filesSeen)} files (${fmtInt(st!.filesChanged)} changed, ${(st!.bytesRead / 1e6).toFixed(0)} MB read)`,
  );
  return `Synced ${parts.join(' · ') || 'nothing (no sources enabled)'} → ${fmtInt(r.rowsWritten)} bucket rows in ${(r.ms / 1000).toFixed(1)}s`;
}

async function printReport(cfg: Config, a: Args): Promise<number> {
  const period = parsePeriod(str(a.flags.since));
  const byFlag = str(a.flags.by);
  if (byFlag && !['model', 'source', 'day'].includes(byFlag)) throw new UsageError('--by expects model, source or day');
  const by = (byFlag ?? 'source-model') as GroupBy;
  const { rows } = await loadBuckets();
  const rep = buildReport(rows.values(), period, cfg, by);
  console.log(a.flags.json ? reportJson(rep) : renderReport(rep));
  return 0;
}

class UsageError extends Error {}

async function main(argv: string[]): Promise<number> {
  const a = parseArgs(argv);
  if (a.flags.version || a.cmd === 'version') {
    console.log(VERSION);
    return 0;
  }
  if (a.flags.help || !a.cmd || a.cmd === 'help') {
    console.log(HELP);
    return a.cmd || a.flags.help ? 0 : 1;
  }
  const quiet = !!a.flags.quiet;
  const yes = !!a.flags.yes;

  switch (a.cmd) {
    case 'init': {
      const det = detect();
      const cfg = loadConfig();
      cfg.sources = detectionToSources(det);
      saveConfig(cfg);
      for (const s of SOURCES) {
        const d = det[s];
        if (s === 'cursor') console.log(`cursor  ${d.found ? `detected — ${d.note}` : 'not found'}`);
        else console.log(`${s.padEnd(7)} ${d.found ? `found: ${d.paths.join(', ')}` : 'not found (disabled)'}`);
      }
      const r = await sync(cfg, (m) => process.stderr.write(`${m}\n`));
      console.log(r.skippedLocked ? 'Another sync is running; showing current data.' : syncSummary(r));
      console.log('');
      await printReport(cfg, a);
      console.log('');
      console.log('Next: tokenmaxxing plan set <provider> <plan>  (for ROI)  ·  tokenmaxxing link  (to publish)');
      return 0;
    }
    case 'sync': {
      // Extra positional args are ignored (Codex `notify` appends a JSON payload).
      const cfg = ensureConfig(quiet);
      const r = await sync(cfg, quiet ? undefined : (m) => process.stderr.write(`${m}\n`));
      if (!quiet) console.log(r.skippedLocked ? 'Another sync is already running.' : syncSummary(r));
      return 0;
    }
    case 'report': {
      const cfg = ensureConfig(false);
      return printReport(cfg, a);
    }
    case 'granularity': {
      const cfg = loadConfig();
      const [sub, val] = a.pos;
      if (sub === 'set') {
        if (!val || !isGranularity(val)) throw new UsageError('granularity must be hour, day or week');
        cfg.site.granularity = val;
        saveConfig(cfg);
        console.log(`Uploads will be ${val}ly totals${val === 'hour' ? '' : '; the site will not see which hours you work'}. The next push replaces this device's rows on the site.`);
        return 0;
      }
      const cur = cfg.site.granularity ?? 'hour';
      console.log(`${cur}  (hour = most detail on your profile · day/week = the site never sees your working hours)\nSet with: tokenmaxxing granularity set hour|day|week`);
      return 0;
    }
    case 'plan':
      return planCommand(a);
    case 'verify': {
      const cfg = ensureConfig(true);
      const period = parsePeriod(str(a.flags.since) ?? '30d');
      const since = period.sinceDate.replace(/-/g, '');
      const cc = await runCcusage(since);
      if (!cc.ok && cc.missing) {
        console.log('ccusage is not installed, so there is nothing to compare against.');
        console.log('Install it with `npm i -g ccusage` (or run `npx ccusage@latest daily`), then re-run `tokenmaxxing verify`.');
        return 0;
      }
      if (!cc.ok) {
        console.error(`ccusage failed: ${cc.error}`);
        return 1;
      }
      // Sync after ccusage so our side has seen at least everything ccusage saw.
      await sync(cfg);
      const { rows } = await loadBuckets();
      console.log(`verify · Claude · ${period.sinceDate} → ${period.untilDate} (local days, as ccusage groups them) · tolerance 1% on tokens\n`);
      const res = compare(ourTotals(rows.values(), period), ccusageTotals(cc.json, period.sinceDate));
      console.log(res.lines.join('\n'));
      return res.pass ? 0 : 1;
    }
    case 'link': {
      const cfg = ensureConfig(true);
      await link(cfg, { site: str(a.flags.site) });
      return 0;
    }
    case 'push': {
      const cfg = ensureConfig(true);
      const g = str(a.flags.granularity);
      if (g !== undefined && !isGranularity(g)) throw new UsageError('--granularity must be hour, day or week');
      await push(cfg, { site: str(a.flags.site), dryRun: !!a.flags['dry-run'], all: !!a.flags.all, granularity: g });
      return 0;
    }
    case 'hook':
      return hookCommand(a.pos[0], { yes });
    case 'schedule':
      return scheduleCommand(a.pos[0], { yes });
    case 'doctor':
      return doctor(VERSION);
    default:
      console.error(`Unknown command: ${a.cmd}\n`);
      console.error(HELP);
      return 1;
  }
}

const PLAN_USAGE =
  'usage: tokenmaxxing plan list | plan set <provider> <plan> [xN] | plan add <provider> <plan> [xN] | plan remove <provider> [<plan>]';

function planSummary(provider: (typeof PROVIDERS)[number], lines: PlanLine[]): string {
  return lines.length ? `${provider}: ${describeLines(lines)} = ${fmtPrice(providerMonthly(provider, lines))}/mo` : `${provider}: no plan`;
}

function planCommand(a: Args): number {
  const cfg = loadConfig();
  const [sub, provider, ...rest] = a.pos;
  if (sub === 'list' || sub === undefined) {
    const rows: string[][] = [];
    for (const p of PROVIDERS) {
      const lines = cfg.plans[p] ?? [];
      if (!lines.length) rows.push([`  ${p}`, 'none', '', '']);
      lines.forEach((l, i) =>
        rows.push([i === 0 ? `* ${p}` : '', `${l.qty}× ${lineName(l)}`, `${fmtPrice(unitPrice(p, l))} each`, `${fmtPrice(unitPrice(p, l) * l.qty)}/mo`]),
      );
      if (lines.length > 1) rows.push(['', `${p} total`, '', `${fmtPrice(providerMonthly(p, lines))}/mo`]);
    }
    console.log(table(['', '', '', ''], rows, ['l', 'l', 'r', 'r'], 3).slice(1).join('\n'));
    if (Object.keys(cfg.plans).length) console.log(`\nAll plans: ${fmtPrice(plansMonthly(cfg.plans))}/mo`);
    const t = planTable();
    console.log('\nAvailable (USD per month per seat):');
    for (const p of PROVIDERS) console.log(`  ${p.padEnd(7)} ${Object.entries(t[p]).map(([k, v]) => `${k} ${fmtPrice(v)}`).join(' · ')}`);
    console.log(`  any     ${CUSTOM} <monthly> [label]   e.g. plan add openai custom 100 "Codex $100 promo"`);
    console.log('\nChange with: tokenmaxxing plan add <provider> <plan> [xN] · plan set <provider> <plan> [xN] · plan remove <provider> [<plan>]   (* = has a plan)');
    return 0;
  }
  if (sub !== 'set' && sub !== 'add' && sub !== 'remove') throw new UsageError(PLAN_USAGE);
  if (!provider || !isProvider(provider)) throw new UsageError(`provider must be one of: ${PROVIDERS.join(', ')}`);
  const cur = cfg.plans[provider] ?? [];
  let next: PlanLine[];
  if (sub === 'remove' || (sub === 'set' && (rest[0] === 'none' || rest[0] === 'off'))) {
    const [plan, ...label] = rest;
    if (sub === 'set' || plan === undefined) next = [];
    else {
      const text = label.join(' ').trim();
      const hits = cur.filter((l) => l.plan === plan && (plan !== CUSTOM || !text || l.label === text));
      if (!hits.length) throw new UsageError(`${provider} has no ${plan}${text ? ` "${text}"` : ''} line (${planSummary(provider, cur)})`);
      if (hits.length > 1) throw new UsageError(`${provider} has ${hits.length} custom lines; name one: ${hits.map((l) => `"${l.label}"`).join(', ')}`);
      next = cur.filter((l) => l !== hits[0]);
    }
  } else {
    const line = parsePlanSpec(provider, rest, typeof a.flags.qty === 'string' ? a.flags.qty : a.flags.qty ? '' : undefined);
    if (typeof line === 'string') throw new UsageError(line);
    if (sub === 'set') next = [line];
    else {
      const merged = addLine(cur, line);
      if (typeof merged === 'string') throw new UsageError(merged);
      next = merged;
    }
  }
  if (next.length) cfg.plans[provider] = next;
  else delete cfg.plans[provider];
  saveConfig(cfg);
  console.log(next.length ? planSummary(provider, next) : `Cleared ${provider} plan.`);
  return 0;
}

/** Commands other than init work without a config by detecting sources on the fly (nothing is written). */
function ensureConfig(quiet: boolean): Config {
  const cfg = loadConfig();
  if (!configExists()) {
    cfg.sources = detectionToSources(detect());
    if (!quiet) process.stderr.write('No config yet (run `tokenmaxxing init`); using detected sources.\n');
  }
  return cfg;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    if (e instanceof SiteError || e instanceof UsageError) console.error(`tokenmaxxing: ${e.message}`);
    else console.error(e?.stack ?? String(e));
    process.exitCode = 1;
  },
);
