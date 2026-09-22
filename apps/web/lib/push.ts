import { z } from "zod";

/**
 * Validation for POST /api/v1/push. Pure: no I/O, so the whole contract is unit-tested.
 *
 * The envelope must be well formed or the request is a 400. Rows are checked one by one:
 * a bad row is listed in `rejected` with its index and reason and the rest are accepted,
 * because the CLI re-sends every row after a failure and upserts are idempotent. A single
 * poisoned row must not wedge a device forever.
 */

export const SOURCES = ["claude", "codex", "gemini", "cursor"] as const;
export type Source = (typeof SOURCES)[number];

export const GRANULARITIES = ["hour", "day", "week"] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export const MAX_ROWS = 5000;
/**
 * Per (hour, source, model) row. This is a sanity bound against corrupt counters, not a budget:
 * one developer running parallel agents measured 575M tokens in an hour, and the heaviest
 * public users run fleets of agents, so the bound is set far above anything plausible today.
 * Columns are bigint, so the value costs nothing.
 */
export const ROW_TOKEN_CAP = 1_000_000_000_000;
export const FUTURE_SLACK_MS = 5 * 60 * 1000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** A day or week row is that many hours summed, so the per-row cap scales with it. */
export const CAP_HOURS: Record<Granularity, number> = { hour: 1, day: 24, week: 168 };

export function rowTokenCap(g: Granularity): number {
  return ROW_TOKEN_CAP * CAP_HOURS[g];
}
const INT32_MAX = 2_147_483_647;

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const smallCount = z.number().int().nonnegative().max(INT32_MAX);

export const rowSchema = z.object({
  v: z.literal(1).optional(),
  ts: z.string(),
  source: z.enum(SOURCES),
  model: z.string().trim().min(1).max(128),
  input: count,
  cache_read: count,
  cache_write_5m: count,
  cache_write_1h: count,
  output: count,
  reasoning: count.default(0),
  requests: smallCount.default(0),
  conversations: smallCount.default(0),
});

export const envelopeSchema = z.object({
  v: z.literal(1),
  deviceId: z.string().min(1).max(64),
  /** How coarse the rows are. Absent means hourly, which is what every CLI before 0.2 sent. */
  granularity: z.enum(GRANULARITIES).default("hour"),
  /** Delete every row the site holds for this device before writing this batch. */
  replaceDevice: z.boolean().optional(),
  rows: z.array(z.unknown()).max(MAX_ROWS),
});

export type PushRow = {
  ts: string;
  granularity: Granularity;
  source: Source;
  model: string;
  input: number;
  cache_read: number;
  cache_write_5m: number;
  cache_write_1h: number;
  output: number;
  reasoning: number;
  requests: number;
  conversations: number;
};

export type Rejected = { index: number; reason: string };

export type PushValidation =
  | { ok: false; error: string; issues?: unknown }
  | {
      ok: true;
      deviceId: string;
      granularity: Granularity;
      replaceDevice: boolean;
      rows: PushRow[];
      rejected: Rejected[];
    };

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

/** Returns the canonical `YYYY-MM-DDTHH:00:00.000Z` for a whole-hour ISO timestamp, else null. */
export function parseWholeHour(ts: string): string | null {
  if (!ISO_RE.test(ts)) return null;
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms) || ms % HOUR_MS !== 0) return null;
  return new Date(ms).toISOString();
}

/**
 * The canonical ISO timestamp when `ts` is the start of a period of granularity `g` (a whole
 * UTC hour; 00:00 UTC; Monday 00:00 UTC), else null.
 */
export function parsePeriodStart(ts: string, g: Granularity): string | null {
  const hour = parseWholeHour(ts);
  if (!hour || g === "hour") return hour;
  const ms = Date.parse(hour);
  if (ms % DAY_MS !== 0) return null;
  if (g === "week" && new Date(ms).getUTCDay() !== 1) return null;
  return hour;
}

const ALIGN_REASON: Record<Granularity, string> = {
  hour: "ts: must be an ISO timestamp on a whole UTC hour",
  day: "ts: must be 00:00 UTC for granularity day",
  week: "ts: must be Monday 00:00 UTC for granularity week",
};

/** Tokens that count toward the cap: everything priced. Reasoning is already inside output. */
export function rowTokens(r: Pick<PushRow, "input" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "output">): number {
  return r.input + r.cache_read + r.cache_write_5m + r.cache_write_1h + r.output;
}

export function validatePush(body: unknown, now: Date = new Date()): PushValidation {
  const env = envelopeSchema.safeParse(body);
  if (!env.success) {
    return { ok: false, error: "invalid_body", issues: z.treeifyError(env.error) };
  }

  const { granularity } = env.data;
  const cap = rowTokenCap(granularity);
  const latest = now.getTime() + FUTURE_SLACK_MS;
  const rejected: Rejected[] = [];
  // Last row per key wins, matching the CLI's own "last replacement row" rule and keeping a
  // single upsert from touching the same primary key twice.
  const byKey = new Map<string, PushRow>();

  env.data.rows.forEach((raw, index) => {
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      rejected.push({ index, reason: `${first.path.join(".") || "row"}: ${first.message}` });
      return;
    }
    const r = parsed.data;
    const ts = parsePeriodStart(r.ts, granularity);
    if (!ts) {
      rejected.push({ index, reason: ALIGN_REASON[granularity] });
      return;
    }
    if (Date.parse(ts) > latest) {
      rejected.push({ index, reason: "ts: in the future" });
      return;
    }
    const tokens = rowTokens(r);
    if (tokens > cap) {
      rejected.push({ index, reason: `tokens: ${tokens} exceeds the ${cap} per ${granularity} cap` });
      return;
    }
    const row: PushRow = {
      ts,
      granularity,
      source: r.source,
      model: r.model,
      input: r.input,
      cache_read: r.cache_read,
      cache_write_5m: r.cache_write_5m,
      cache_write_1h: r.cache_write_1h,
      output: r.output,
      reasoning: r.reasoning,
      requests: r.requests,
      conversations: r.conversations,
    };
    byKey.set(`${ts}\u0000${r.source}\u0000${r.model}`, row);
  });

  return {
    ok: true,
    deviceId: env.data.deviceId,
    granularity,
    replaceDevice: env.data.replaceDevice === true,
    rows: [...byKey.values()],
    rejected,
  };
}
