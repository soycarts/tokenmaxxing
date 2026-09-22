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
}

/** Rows to send: the current (last-per-key) row for every hour at or after lastPushedTs. */
export function planPush(all: Iterable<Bucket>, lastPushedTs?: string): PushPlan {
  const rows = sortRows([...all].filter((r) => r.source !== 'cursor' && (!lastPushedTs || r.ts >= lastPushedTs))).map(cleanRow);
  const batches: Bucket[][] = [];
  for (let i = 0; i < rows.length; i += PUSH_BATCH) batches.push(rows.slice(i, i + PUSH_BATCH));
  return { rows, batches, from: rows[0]?.ts, to: rows.at(-1)?.ts };
}

export interface PushOptions {
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
  const plan = planPush(rows.values(), cfg.site.lastPushedTs);
  if (!plan.rows.length) {
    log('Nothing to push.');
    return 0;
  }
  const url = `${site}/api/v1/push`;
  log(`${opts.dryRun ? 'Would send' : 'Sending'} ${plan.rows.length} bucket row${plan.rows.length === 1 ? '' : 's'} (${plan.from} → ${plan.to}) in ${plan.batches.length} request${plan.batches.length === 1 ? '' : 's'} to POST ${url}`);
  log(`Each request body is exactly: { "v": 1, "deviceId": "${cfg.deviceId}", "rows": [ …up to ${PUSH_BATCH} rows… ] }`);
  log(`Row fields: v, ts, source, model, input, cache_read, cache_write_5m, cache_write_1h, output, reasoning, requests, conversations. No paths, projects or prompts.`);
  log(`First row: ${JSON.stringify(plan.rows[0])}`);
  if (opts.dryRun) {
    for (const b of plan.batches) log(JSON.stringify({ v: 1, deviceId: cfg.deviceId, rows: b }));
    return 0;
  }
  log('(run `tokenmaxxing push --dry-run` to print every row without sending)');
  let sent = 0;
  for (const batch of plan.batches) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.site.token}` },
        body: JSON.stringify({ v: 1, deviceId: cfg.deviceId, rows: batch }),
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
    const rejected: unknown[] = Array.isArray(body?.rejected) ? body.rejected : [];
    if (rejected.length) {
      log(`Site rejected ${rejected.length} of ${batch.length} rows in this batch (kept the rest):`);
      for (const r of rejected.slice(0, 5)) log(`  ${JSON.stringify(r)}`);
      if (rejected.length > 5) log(`  …and ${rejected.length - 5} more`);
    }
    sent += batch.length - rejected.length;
    cfg.site.lastPushedTs = batch.at(-1)!.ts;
    saveConfig(cfg);
  }
  log(`Pushed ${sent} rows.`);
  return sent;
}
