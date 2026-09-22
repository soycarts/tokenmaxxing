import { execFile } from 'node:child_process';
import { fmtInt, fmtUsd, table } from './format.js';
import { inPeriod, type Period } from './period.js';
import { cost, resolve } from './pricing/index.js';
import type { Bucket } from './types.js';

export const TOLERANCE = 0.01;
const METRICS = ['input', 'output', 'cache_write', 'cache_read'] as const;
type Metric = (typeof METRICS)[number];
/** Output is informational: ccusage keeps the first line of a multi-line message, we keep the final usage. */
const STRICT: readonly Metric[] = ['input', 'cache_write', 'cache_read'];
export const OUTPUT_NOTE = 'expected higher than ccusage: tokenmaxxing counts the final usage of multi-line messages';
type Totals = Record<Metric, number> & { cost: number };

const zero = (): Totals => ({ input: 0, output: 0, cache_write: 0, cache_read: 0, cost: 0 });

export interface CcusageDaily {
  daily?: { date: string; modelBreakdowns?: { modelName: string; inputTokens?: number; outputTokens?: number; cacheCreationTokens?: number; cacheReadTokens?: number; cost?: number }[] }[];
}

export function ccusageTotals(j: CcusageDaily, sinceDate: string): Map<string, Totals> {
  const m = new Map<string, Totals>();
  for (const d of j.daily ?? []) {
    if (d.date < sinceDate) continue;
    for (const b of d.modelBreakdowns ?? []) {
      if (!b.modelName || b.modelName === '<synthetic>') continue;
      const t = m.get(b.modelName) ?? zero();
      t.input += b.inputTokens ?? 0;
      t.output += b.outputTokens ?? 0;
      t.cache_write += b.cacheCreationTokens ?? 0;
      t.cache_read += b.cacheReadTokens ?? 0;
      t.cost += b.cost ?? 0;
      m.set(b.modelName, t);
    }
  }
  return m;
}

export function ourTotals(buckets: Iterable<Bucket>, period: Period): Map<string, Totals> {
  const m = new Map<string, Totals>();
  for (const b of buckets) {
    if (b.source !== 'claude' || !inPeriod(b.ts, period)) continue;
    const t = m.get(b.model) ?? zero();
    t.input += b.input;
    t.output += b.output;
    t.cache_write += b.cache_write_5m + b.cache_write_1h;
    t.cache_read += b.cache_read;
    const r = resolve(b.model);
    if (r) t.cost += cost(b, r);
    m.set(b.model, t);
  }
  return m;
}

function delta(ours: number, theirs: number): number {
  if (ours === theirs) return 0;
  return (ours - theirs) / Math.max(Math.abs(theirs), 1);
}

export interface VerifyResult {
  pass: boolean;
  lines: string[];
}

export function compare(ours: Map<string, Totals>, theirs: Map<string, Totals>): VerifyResult {
  const models = [...new Set([...ours.keys(), ...theirs.keys()])].sort();
  const rows: string[][] = [];
  const tOurs = zero();
  const tTheirs = zero();
  let pass = true;
  const failed: string[] = [];
  const status = (k: Metric, d: number, label: string): string => {
    if (!STRICT.includes(k)) return '(info)';
    if (Math.abs(d) <= TOLERANCE) return 'ok';
    pass = false;
    failed.push(label);
    return 'FAIL';
  };
  for (const model of models) {
    const a = ours.get(model) ?? zero();
    const b = theirs.get(model) ?? zero();
    if (METRICS.every((k) => a[k] === 0 && b[k] === 0)) continue;
    METRICS.forEach((k, i) => {
      const d = delta(a[k], b[k]);
      rows.push([i === 0 ? model : '', k, fmtInt(a[k]), fmtInt(b[k]), fmtPct(d), status(k, d, `${model} ${k}`)]);
    });
    rows.push(['', 'cost', fmtUsd(a.cost), fmtUsd(b.cost), fmtPct(delta(a.cost, b.cost)), '(info)']);
    for (const k of [...METRICS, 'cost'] as const) {
      tOurs[k] += a[k];
      tTheirs[k] += b[k];
    }
  }
  METRICS.forEach((k, i) => {
    const d = delta(tOurs[k], tTheirs[k]);
    rows.push([i === 0 ? 'TOTAL' : '', k, fmtInt(tOurs[k]), fmtInt(tTheirs[k]), fmtPct(d), status(k, d, `TOTAL ${k}`)]);
  });
  rows.push(['', 'cost', fmtUsd(tOurs.cost), fmtUsd(tTheirs.cost), fmtPct(delta(tOurs.cost, tTheirs.cost)), '(info)']);
  const lines = table(['MODEL', 'METRIC', 'TOKENMAXXING', 'CCUSAGE', 'DELTA', ''], rows, ['l', 'l', 'r', 'r', 'r', 'l']);
  lines.push('');
  lines.push(
    pass
      ? `PASS — input, cache_write and cache_read within ${TOLERANCE * 100}% of ccusage.`
      : `FAIL — outside ${TOLERANCE * 100}% tolerance: ${failed.join(', ')}`,
  );
  const outDelta = delta(tOurs.output, tTheirs.output);
  lines.push(`Output ${fmtPct(outDelta)} vs ccusage (informational, not part of pass/fail): ${OUTPUT_NOTE}.`);
  lines.push(
    'Cost is informational and differs by design: ccusage prices every cache write at the 5-minute rate, while tokenmaxxing',
    'prices 1-hour cache writes at the 1-hour rate, and uses the bundled pricing snapshot instead of live prices.',
  );
  return { pass, lines };
}

export function fmtPct(d: number): string {
  const p = d * 100;
  return (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
}

export function runCcusage(sinceYmd: string): Promise<{ ok: true; json: CcusageDaily } | { ok: false; missing: boolean; error: string }> {
  return new Promise((resolveP) => {
    execFile(
      'ccusage',
      ['daily', '--since', sinceYmd, '--json'],
      { maxBuffer: 512 * 1024 * 1024, timeout: 10 * 60 * 1000 },
      (err, stdout, stderr) => {
        if (err) {
          const missing = (err as NodeJS.ErrnoException).code === 'ENOENT';
          resolveP({ ok: false, missing, error: missing ? 'ccusage not found on PATH' : (stderr || err.message).trim() });
          return;
        }
        try {
          resolveP({ ok: true, json: JSON.parse(stdout) });
        } catch (e) {
          resolveP({ ok: false, missing: false, error: `could not parse ccusage output: ${(e as Error).message}` });
        }
      },
    );
  });
}
