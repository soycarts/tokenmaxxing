/**
 * 30-day spend sparkline as inline SVG. Bars, because days with zero usage should read as gaps.
 * The latest day is the gold one.
 */
export function Sparkline({ days }: { days: { day: string; usd: number }[] }) {
  const w = 300;
  const h = 72;
  const n = Math.max(days.length, 1);
  const max = Math.max(...days.map((d) => d.usd), 0);
  const gap = 2.5;
  const bw = (w - gap * (n - 1)) / n;
  const total = days.reduce((s, d) => s + d.usd, 0);
  const label = `API-equivalent spend per day over the last ${days.length} days, $${total.toFixed(2)} in total`;

  return (
    <svg viewBox={`0 0 ${w} ${h + 2}`} className="h-20 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
      <title>{label}</title>
      {days.map((d, i) => {
        const bh = max > 0 ? Math.max((d.usd / max) * h, d.usd > 0 ? 2.5 : 0) : 0;
        const last = i === days.length - 1;
        return (
          <rect
            key={d.day}
            x={i * (bw + gap)}
            y={h - bh}
            width={bw}
            height={bh}
            rx={Math.min(bw / 3, 2)}
            fill={last ? "var(--gold)" : "var(--candy-peri)"}
            stroke={last ? "var(--edge)" : "none"}
            strokeWidth={last ? 1.5 : 0}
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${d.day}: $${d.usd.toFixed(2)}`}</title>
          </rect>
        );
      })}
      <line x1="0" x2={w} y1={h + 1} y2={h + 1} stroke="var(--ink)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
