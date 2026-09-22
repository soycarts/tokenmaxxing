import { localDate } from './format.js';

export interface Period {
  /** Inclusive start instant (local midnight). */
  start: Date;
  /** Exclusive end instant (now). */
  end: Date;
  /** Local date labels. */
  sinceDate: string;
  untilDate: string;
  /** Length used for ROI proration. */
  days: number;
  label: string;
}

const DAY = 86_400_000;

/**
 * `--since 7d|30d|YYYY-MM-DD` (default 30d). Days are local calendar days, matching ccusage:
 * "30d" on 2026-09-22 covers 2026-08-23 00:00 local → now.
 */
export function parsePeriod(since: string | undefined, now = new Date()): Period {
  const s = (since ?? '30d').trim();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start: Date;
  let days: number;
  let label: string;
  const rel = /^(\d+)d$/i.exec(s);
  const abs = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(s);
  if (rel) {
    days = Number(rel[1]);
    if (!(days > 0)) throw new Error(`--since must be positive: ${s}`);
    start = new Date(todayMidnight.getFullYear(), todayMidnight.getMonth(), todayMidnight.getDate() - days);
    label = `last ${days} day${days === 1 ? '' : 's'}`;
  } else if (abs) {
    start = new Date(Number(abs[1]), Number(abs[2]) - 1, Number(abs[3]));
    if (Number.isNaN(start.getTime()) || start > now) throw new Error(`invalid --since date: ${s}`);
    days = Math.max(1, Math.round((todayMidnight.getTime() - start.getTime()) / DAY));
    label = `since ${localDate(start)}`;
  } else {
    throw new Error(`--since expects 7d, 30d or YYYY-MM-DD (got "${s}")`);
  }
  return { start, end: now, sinceDate: localDate(start), untilDate: localDate(now), days, label };
}

export function inPeriod(ts: string, p: Period): boolean {
  const t = Date.parse(ts);
  return t >= p.start.getTime() && t < p.end.getTime();
}
