export const PERIODS = ["week", "month", "all"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period, string> = { week: "7 days", month: "30 days", all: "All time" };

export const METRICS = ["value", "roi", "efficiency", "volume"] as const;
export type Metric = (typeof METRICS)[number];

export function parsePeriod(raw: unknown, fallback: Period = "week"): Period {
  return typeof raw === "string" && (PERIODS as readonly string[]).includes(raw) ? (raw as Period) : fallback;
}

export function parseMetric(raw: unknown, fallback: Metric = "value"): Metric {
  return typeof raw === "string" && (METRICS as readonly string[]).includes(raw) ? (raw as Metric) : fallback;
}

export const HANDLE_RE = /^[a-z0-9-]{3,24}$/;
export const SLUG_RE = /^[a-z0-9-]{2,32}$/;
