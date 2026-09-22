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
  rows: z.array(z.unknown()).max(MAX_ROWS),
});

export type PushRow = {
  ts: string;
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
  | { ok: true; deviceId: string; rows: PushRow[]; rejected: Rejected[] };

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

/** Returns the canonical `YYYY-MM-DDTHH:00:00.000Z` for a whole-hour ISO timestamp, else null. */
export function parseWholeHour(ts: string): string | null {
  if (!ISO_RE.test(ts)) return null;
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms) || ms % HOUR_MS !== 0) return null;
  return new Date(ms).toISOString();
}

/** Tokens that count toward the cap: everything priced. Reasoning is already inside output. */
export function rowTokens(r: Pick<PushRow, "input" | "cache_read" | "cache_write_5m" | "cache_write_1h" | "output">): number {
  return r.input + r.cache_read + r.cache_write_5m + r.cache_write_1h + r.output;
}

export function validatePush(body: unknown, now: Date = new Date()): PushValidation {
  const env = envelopeSchema.safeParse(body);
  if (!env.success) {
    return { ok: false, error: "invalid_body", issues: z.treeifyError(env.error) };
  }

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
    const ts = parseWholeHour(r.ts);
    if (!ts) {
      rejected.push({ index, reason: "ts: must be an ISO timestamp on a whole UTC hour" });
      return;
    }
    if (Date.parse(ts) > latest) {
      rejected.push({ index, reason: "ts: in the future" });
      return;
    }
    const tokens = rowTokens(r);
    if (tokens > ROW_TOKEN_CAP) {
      rejected.push({ index, reason: `tokens: ${tokens} exceeds the ${ROW_TOKEN_CAP} per hour cap` });
      return;
    }
    const row: PushRow = {
      ts,
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

  return { ok: true, deviceId: env.data.deviceId, rows: [...byKey.values()], rejected };
}
