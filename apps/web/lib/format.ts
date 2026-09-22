const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatUsd(n: number | null | undefined, opts: { cents?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (opts.cents || Math.abs(n) < 100) return usd2.format(n);
  return usd0.format(n);
}

/** 1234 → 1.2k, 317_500_000 → 317.5M, the same units the CLI report prints. */
export function formatTokens(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "k"],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const v = n / size;
      return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)}${suffix}`;
    }
  }
  return String(Math.round(n));
}

export function formatRoi(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n >= 100 ? n.toFixed(0) : n.toFixed(1)}×`;
}

export function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(n >= 0.995 && n < 1 ? 1 : 0)}%`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "never";
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}
