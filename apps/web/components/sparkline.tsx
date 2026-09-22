/** 30-day spend sparkline as inline SVG. Bars, because days with zero usage should read as gaps. */
export function Sparkline({ days }: { days: { day: string; usd: number }[] }) {
  const w = 300;
  const h = 64;
  const n = Math.max(days.length, 1);
  const max = Math.max(...days.map((d) => d.usd), 0);
  const gap = 2;
  const bw = (w - gap * (n - 1)) / n;
  const total = days.reduce((s, d) => s + d.usd, 0);
  const label = `API-equivalent spend per day over the last ${days.length} days, $${total.toFixed(2)} in total`;

  return (
    <svg viewBox={`0 0 ${w} ${h + 1}`} className="h-16 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
      <title>{label}</title>
      <line x1="0" x2={w} y1={h + 0.5} y2={h + 0.5} stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {days.map((d, i) => {
        const bh = max > 0 ? Math.max((d.usd / max) * h, d.usd > 0 ? 2 : 0) : 0;
        return (
          <rect key={d.day} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} fill={i === days.length - 1 ? "var(--amber)" : "var(--muted)"} opacity={i === days.length - 1 ? 1 : 0.55}>
            <title>{`${d.day}: $${d.usd.toFixed(2)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
