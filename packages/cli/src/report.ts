import type { Config } from './config.js';
import { fmtPrice, fmtTokens, fmtUsd, localDate, table } from './format.js';
import { inPeriod, type Period } from './period.js';
import { CUSTOM, describeLines, providerMonthly, PROVIDERS, roi, sourceFor, unitPrice } from './plans.js';
import { cost, resolve, SNAPSHOT_DATE, unpricedNote } from './pricing/index.js';
import { COUNT_FIELDS, type Bucket, type Provider, type SourceName } from './types.js';

export type GroupBy = 'source-model' | 'model' | 'source' | 'day';

export interface ReportRow {
  source?: SourceName;
  model?: string;
  day?: string;
  input: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  output: number;
  reasoning: number;
  requests: number;
  conversations: number;
  /** API-equivalent USD; null when the row contains only unpriced models. */
  cost: number | null;
  /** Tokens in this row that could not be priced. */
  unpriced_tokens: number;
}

export interface PlanRoi {
  provider: Provider;
  source: SourceName;
  /** `monthly` is the price of one seat; custom lines carry their label. */
  lines: { plan: string; qty: number; monthly: number; label?: string }[];
  /** Σ monthly × qty. */
  monthly: number;
  /** API-equivalent cost of the provider's source over the period. */
  api_equiv: number;
  roi: number | null;
}

export interface Report {
  period: { label: string; since: string; until: string; days: number; start: string; end: string };
  pricing_snapshot: string;
  by: GroupBy;
  rows: ReportRow[];
  totals: Omit<ReportRow, 'source' | 'model' | 'day'> & { cost: number };
  plans: PlanRoi[];
  unpriced: { source: SourceName; model: string; tokens: number; note?: string }[];
  excluded: { source: SourceName; reason: string }[];
}

const tokensOf = (b: Pick<Bucket, 'input' | 'cache_read' | 'cache_write_5m' | 'cache_write_1h' | 'output'>) =>
  b.input + b.cache_read + b.cache_write_5m + b.cache_write_1h + b.output;

function zeroRow(): ReportRow {
  return {
    input: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, output: 0, reasoning: 0,
    requests: 0, conversations: 0, cost: null, unpriced_tokens: 0,
  };
}

export function buildReport(buckets: Iterable<Bucket>, period: Period, cfg: Config, by: GroupBy = 'source-model'): Report {
  const groups = new Map<string, ReportRow>();
  const unpriced = new Map<string, Report['unpriced'][number]>();
  const costBySource = new Map<SourceName, number>();
  const totals = { ...zeroRow(), cost: 0 };

  for (const b of buckets) {
    if (b.source === 'cursor' || !inPeriod(b.ts, period)) continue;
    const day = localDate(Date.parse(b.ts));
    const key =
      by === 'model' ? b.model : by === 'source' ? b.source : by === 'day' ? day : `${b.source}|${b.model}`;
    let row = groups.get(key);
    if (!row) {
      row = zeroRow();
      if (by === 'model') row.model = b.model;
      else if (by === 'source') row.source = b.source;
      else if (by === 'day') row.day = day;
      else {
        row.source = b.source;
        row.model = b.model;
      }
      groups.set(key, row);
    }
    for (const f of COUNT_FIELDS) {
      row[f] += b[f];
      totals[f] += b[f];
    }
    const rates = resolve(b.model);
    if (rates) {
      const c = cost(b, rates);
      row.cost = (row.cost ?? 0) + c;
      totals.cost += c;
      costBySource.set(b.source, (costBySource.get(b.source) ?? 0) + c);
    } else {
      const t = tokensOf(b);
      row.unpriced_tokens += t;
      totals.unpriced_tokens += t;
      const uk = `${b.source}|${b.model}`;
      let u = unpriced.get(uk);
      if (!u) {
        const note = unpricedNote(b.model);
        u = { source: b.source, model: b.model, tokens: 0, ...(note ? { note } : {}) };
      }
      u.tokens += t;
      unpriced.set(uk, u);
    }
  }

  const rows = [...groups.values()].sort((a, b) => {
    if (by === 'day') return (a.day ?? '') < (b.day ?? '') ? -1 : 1;
    if (a.source !== b.source) return (a.source ?? '') < (b.source ?? '') ? -1 : 1;
    return (b.cost ?? -1) - (a.cost ?? -1) || tokensOf(b) - tokensOf(a);
  });

  const plans: PlanRoi[] = [];
  for (const provider of PROVIDERS) {
    const lines = cfg.plans[provider];
    if (!lines?.length) continue;
    const source = sourceFor(provider);
    const monthly = providerMonthly(provider, lines);
    const c = costBySource.get(source) ?? 0;
    plans.push({
      provider,
      source,
      lines: lines.map((l) => ({
        plan: l.plan,
        qty: l.qty,
        monthly: unitPrice(provider, l),
        ...(l.plan === CUSTOM ? { label: l.label } : {}),
      })),
      monthly,
      api_equiv: c,
      roi: monthly > 0 ? roi(c, monthly, period.days) : null,
    });
  }

  const excluded: Report['excluded'] = [];
  if (cfg.sources.cursor?.enabled) {
    excluded.push({ source: 'cursor', reason: 'token counts not available locally; Cursor is excluded from totals' });
  }

  return {
    period: {
      label: period.label,
      since: period.sinceDate,
      until: period.untilDate,
      days: period.days,
      start: period.start.toISOString(),
      end: period.end.toISOString(),
    },
    pricing_snapshot: SNAPSHOT_DATE,
    by,
    rows,
    totals,
    plans,
    unpriced: [...unpriced.values()].sort((a, b) => b.tokens - a.tokens),
    excluded,
  };
}

function costCell(r: { cost: number | null; unpriced_tokens: number }): string {
  if (r.cost === null) return 'unpriced';
  return fmtUsd(r.cost) + (r.unpriced_tokens > 0 ? '*' : '');
}

export function renderReport(rep: Report): string {
  const out: string[] = [];
  out.push(
    `tokenmaxxing · ${rep.period.label} · ${rep.period.since} → ${rep.period.until} · pricing snapshot ${rep.pricing_snapshot}`,
    '',
  );
  const lead: string[] =
    rep.by === 'model' ? ['MODEL'] : rep.by === 'source' ? ['SOURCE'] : rep.by === 'day' ? ['DAY'] : ['SOURCE', 'MODEL'];
  const header = [...lead, 'INPUT', 'CACHE R', 'CACHE W', 'OUTPUT', 'API-EQUIV'];
  const align = [...lead.map(() => 'l' as const), 'r', 'r', 'r', 'r', 'r'] as ('l' | 'r')[];
  const body = rep.rows.map((r) => [
    ...(rep.by === 'model' ? [r.model!] : rep.by === 'source' ? [r.source!] : rep.by === 'day' ? [r.day!] : [r.source!, r.model!]),
    fmtTokens(r.input),
    fmtTokens(r.cache_read),
    fmtTokens(r.cache_write_5m + r.cache_write_1h),
    fmtTokens(r.output),
    costCell(r),
  ]);
  if (!body.length) {
    out.push('No usage in this period.');
  } else {
    const lines = table(header, body, align);
    const width = Math.max(...lines.map((l) => l.length));
    out.push(...lines);
    out.push('─'.repeat(width));
    const t = rep.totals;
    const totalCells = [
      'TOTAL',
      ...lead.slice(1).map(() => ''),
      fmtTokens(t.input),
      fmtTokens(t.cache_read),
      fmtTokens(t.cache_write_5m + t.cache_write_1h),
      fmtTokens(t.output),
      fmtUsd(t.cost),
    ];
    // Align the TOTAL row with the table's columns.
    out.push(table(header, [...body, totalCells], align).at(-1)!);
  }
  out.push('');

  if (!rep.plans.length) {
    out.push('Plans:  none set (tokenmaxxing plan set <provider> <plan> to see ROI)');
  } else {
    const planRows = rep.plans.map((p) => [
      p.provider,
      describeLines(p.lines),
      `= ${fmtPrice(p.monthly)}/mo`,
      `→ API-equivalent ${fmtUsd(p.api_equiv)}`,
      p.roi === null ? '' : `→ ROI ${p.roi.toFixed(1)}×`,
    ]);
    if (rep.plans.length > 1) {
      const monthly = Math.round(rep.plans.reduce((s, p) => s + p.monthly, 0) * 100) / 100;
      const c = rep.plans.reduce((s, p) => s + p.api_equiv, 0);
      planRows.push(['total', '', `= ${fmtPrice(monthly)}/mo`, `→ API-equivalent ${fmtUsd(c)}`, `→ ROI ${roi(c, monthly, rep.period.days).toFixed(1)}×`]);
    }
    table(['', '', '', '', ''], planRows, ['l', 'l', 'l', 'l', 'l'], 2)
      .slice(1)
      .forEach((l, i) => out.push((i === 0 ? 'Plans:  ' : '        ') + l));
  }
  const up = rep.unpriced.length
    ? rep.unpriced.map((u) => `${u.source}/${u.model} (${fmtTokens(u.tokens)} tokens${u.note ? ` — ${u.note}` : ''})`).join(', ')
    : 'none';
  out.push(`Unpriced models (0 tokens counted toward $): ${up}`);
  for (const e of rep.excluded) out.push(`${cap(e.source)}: detected — ${e.reason}`);
  return out.join('\n');
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function reportJson(rep: Report): string {
  return JSON.stringify(rep, null, 2);
}
