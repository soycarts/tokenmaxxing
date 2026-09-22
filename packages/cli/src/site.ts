import type { Granularity } from './config.js';
import { randomBytes } from 'node:crypto';
import { saveConfig, siteUrl, type Config } from './config.js';
import { cleanRow, loadBuckets, sortRows } from './store.js';
import type { Bucket } from './types.js';

export const PUSH_BATCH = 5000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

export function linkCode(): string {
  const bytes = randomBytes(8);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

function describeNetError(e: unknown, url: string): string {
  const err = e as any;
  const code = err?.cause?.code ?? err?.code;
  if (code === 'ECONNREFUSED') return `could not connect to ${url} (connection refused). Is the site running? Use --site to point elsewhere.`;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `could not resolve ${new URL(url).host}. Check your network or use --site.`;
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return `request to ${url} timed out.`;
  return `request to ${url} failed: ${err?.cause?.message ?? err?.message ?? String(e)}`;
}

export class SiteError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface LinkOptions {
  site?: string;
  intervalMs?: number;
  timeoutMs?: number;
  log?: (s: string) => void;
}

/** Print the sign-in URL, poll the site until it hands back { token, handle }, store both. */
export async function link(cfg: Config, opts: LinkOptions = {}): Promise<{ handle?: string }> {
  const log = opts.log ?? console.log;
  const site = siteUrl(cfg, opts.site);
  const interval = opts.intervalMs ?? Number(process.env.TOKENMAXXING_POLL_MS ?? 3000);
  const timeout = opts.timeoutMs ?? 5 * 60 * 1000;
  const code = linkCode();
  log(`Open ${site}/link?code=${code} and sign in`);
  log(`Waiting for the site to confirm (polling ${site}/api/v1/link/${code} every ${Math.round(interval / 1000)}s, up to ${Math.round(timeout / 60000)} min)…`);
  const deadline = Date.now() + timeout;
  const url = `${site}/api/v1/link/${code}`;
  while (Date.now() < deadline) {
    let res: Response;
    try {
      res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    } catch (e) {
      throw new SiteError(describeNetError(e, url));
    }
    if (res.status === 404) {
      throw new SiteError(
        `${site} has no link endpoint yet (GET /api/v1/link/{code} returned 404). The site may not be live; nothing was stored.`,
      );
    }
    if (res.ok && res.status !== 202 && res.status !== 204) {
      let body: any = null;
      try {
        body = await res.json();
      } catch {
        /* not json yet */
      }
      if (body && typeof body.token === 'string' && body.token) {
        cfg.site = { ...cfg.site, url: site, token: body.token, handle: typeof body.handle === 'string' ? body.handle : undefined };
        saveConfig(cfg);
        log(`Linked${cfg.site.handle ? ` as @${cfg.site.handle}` : ''}. Run \`tokenmaxxing push\` to publish your buckets.`);
        return { handle: cfg.site.handle };
      }
    } else if (!res.ok) {
      throw new SiteError(`${url} returned HTTP ${res.status}.`);
    }
    await sleep(interval);
  }
  throw new SiteError('Timed out waiting for sign-in (5 min). Run `tokenmaxxing link` again.');
}

export interface PushPlan {
  rows: Bucket[];
  batches: Bucket[][];
  from?: string;
  to?: string;
  /** Latest local hourly ts covered by the plan; becomes the next high-water mark. */
  maxHourlyTs?: string;
  granularity: Granularity;
}

/** Start of the period containing an hourly ts: the hour itself, 00:00 UTC, or Monday 00:00 UTC. */
export function periodStart(ts: string, g: Granularity): string {
  if (g === 'hour') return ts;
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  if (g === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().replace('.000Z', 'Z');
}

/** Sum hourly rows into one row per (period, source, model). Hour is the identity. */
export function foldRows(rows: Bucket[], g: Granularity): Bucket[] {
  if (g === 'hour') return rows;
  const out = new Map<string, Bucket>();
  for (const r of rows) {
    const ts = periodStart(r.ts, g);
    const k = `${ts}|${r.source}|${r.model}`;
    const cur = out.get(k);
    if (!cur) {
      out.set(k, { ...r, ts });
      continue;
    }
    for (const f of ['input', 'cache_read', 'cache_write_5m', 'cache_write_1h', 'output', 'reasoning', 'requests', 'conversations'] as const) {
      cur[f] += r[f];
    }
  }
  return sortRows([...out.values()]);
}

/**
 * Rows to send: the current (last-per-key) row for every hour at or after lastPushedTs, folded to
 * the chosen granularity. The whole period containing lastPushedTs is resent so a partial day or
 * week is replaced by its complete total on the next push.
 */
export function planPush(all: Iterable<Bucket>, lastPushedTs?: string, granularity: Granularity = 'hour'): PushPlan {
  const floor = lastPushedTs ? periodStart(lastPushedTs, granularity) : undefined;
  const hourly = sortRows([...all].filter((r) => r.source !== 'cursor' && (!floor || r.ts >= floor))).map(cleanRow);
  const rows = foldRows(hourly, granularity);
  const batches: Bucket[][] = [];
  for (let i = 0; i < rows.length; i += PUSH_BATCH) batches.push(rows.slice(i, i + PUSH_BATCH));
  return { rows, batches, from: rows[0]?.ts, to: rows.at(-1)?.ts, maxHourlyTs: hourly.at(-1)?.ts, granularity };
}

export interface PushOptions {
  /** Resend every row, ignoring the high-water mark. */
  all?: boolean;
  /** Override config.site.granularity for this push (and store it). */
  granularity?: Granularity;
  site?: string;
  dryRun?: boolean;
  log?: (s: string) => void;
}

export async function push(cfg: Config, opts: PushOptions = {}): Promise<number> {
  const log = opts.log ?? console.log;
  const site = siteUrl(cfg, opts.site);
  if (!cfg.site.token && !opts.dryRun) {
    throw new SiteError('Not linked. Run `tokenmaxxing link` first.');
  }
  const { rows } = await loadBuckets();
  const granularity: Granularity = opts.granularity ?? cfg.site.granularity ?? 'hour';
  if (opts.granularity && opts.granularity !== cfg.site.granularity) {
    cfg.site.granularity = opts.granularity;
    saveConfig(cfg);
  }
  // Changing granularity (or --all) replaces everything the site holds for this device.
  const replace = opts.all || (cfg.site.lastPushedGranularity ?? 'hour') !== granularity;
  const plan = planPush(rows.values(), replace ? undefined : cfg.site.lastPushedTs, granularity);
  let earliestRejected: string | undefined;
  if (!plan.rows.length) {
    log('Nothing to push.');
    return 0;
  }
  const url = `${site}/api/v1/push`;
  log(`${opts.dryRun ? 'Would send' : 'Sending'} ${plan.rows.length} bucket row${plan.rows.length === 1 ? '' : 's'} (${plan.from} → ${plan.to}) in ${plan.batches.length} request${plan.batches.length === 1 ? '' : 's'} to POST ${url}`);
  log(`Granularity: ${granularity}${granularity === 'hour' ? '' : ' (rows are ' + granularity + 'ly totals; the site never sees your hours)'}${replace ? ' — replacing every row the site holds for this device' : ''}.`);
  log(`Each request body is exactly: { "v": 1, "deviceId": "${cfg.deviceId}", "granularity": "${granularity}"${replace ? ', "replaceDevice": true (first request only)' : ''}, "rows": [ …up to ${PUSH_BATCH} rows… ] }`);
  log(`Row fields: v, ts, source, model, input, cache_read, cache_write_5m, cache_write_1h, output, reasoning, requests, conversations. No paths, projects or prompts.`);
  log(`First row: ${JSON.stringify(plan.rows[0])}`);
  if (opts.dryRun) {
    plan.batches.forEach((b, i) => log(JSON.stringify({ v: 1, deviceId: cfg.deviceId, granularity, ...(replace && i === 0 ? { replaceDevice: true } : {}), rows: b })));
    return 0;
  }
  log('(run `tokenmaxxing push --dry-run` to print every row without sending)');
  let sent = 0;
  for (const [bi, batch] of plan.batches.entries()) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.site.token}` },
        body: JSON.stringify({ v: 1, deviceId: cfg.deviceId, granularity, ...(replace && bi === 0 ? { replaceDevice: true } : {}), rows: batch }),
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      throw new SiteError(describeNetError(e, url));
    }
    if (res.status === 404) throw new SiteError(`${site} has no push endpoint yet (POST /api/v1/push returned 404). The site may not be live.`);
    if (res.status === 401 || res.status === 403) throw new SiteError(`${site} rejected the token (HTTP ${res.status}). Run \`tokenmaxxing link\` again.`);
    if (!res.ok) throw new SiteError(`${url} returned HTTP ${res.status}.`);
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
    const rejected: Array<{ index?: number }> = Array.isArray(body?.rejected) ? body.rejected : [];
    if (rejected.length) {
      log(`Site rejected ${rejected.length} of ${batch.length} rows in this batch (kept the rest):`);
      for (const r of rejected.slice(0, 5)) log(`  ${JSON.stringify(r)}`);
      if (rejected.length > 5) log(`  …and ${rejected.length - 5} more`);
      for (const r of rejected) {
        const row = typeof r.index === 'number' ? batch[r.index] : undefined;
        if (row && (!earliestRejected || row.ts < earliestRejected)) earliestRejected = row.ts;
      }
    }
    sent += batch.length - rejected.length;
    // Never advance the high-water mark past a rejected period, so the next push retries it.
    const mark = bi === plan.batches.length - 1 ? (plan.maxHourlyTs ?? batch.at(-1)!.ts) : batch.at(-1)!.ts;
    cfg.site.lastPushedTs = earliestRejected && earliestRejected < mark ? earliestRejected : mark;
    cfg.site.lastPushedGranularity = granularity;
    saveConfig(cfg);
  }
  if (earliestRejected) log(`Some rows were rejected; the next push retries from ${earliestRejected}. Run \`tokenmaxxing push --all\` to resend everything.`);
  log(`Pushed ${sent} rows.`);
  return sent;
}
