/** 950 → "950", 2900 → "2.9k", 317_500_000 → "317.5M", 23e9 → "23.0B". */
export function fmtTokens(n: number): string {
  const a = Math.abs(n);
  if (a < 1000) return String(Math.round(n));
  if (a < 1e6) return (n / 1e3).toFixed(1) + 'k';
  if (a < 1e9) return (n / 1e6).toFixed(1) + 'M';
  if (a < 1e12) return (n / 1e9).toFixed(1) + 'B';
  return (n / 1e12).toFixed(1) + 'T';
}

/** 4476.25 → "$4,476.25" */
export function fmtUsd(n: number, decimals = 2): string {
  const sign = n < 0 ? '-' : '';
  const [int, frac] = Math.abs(n).toFixed(decimals).split('.');
  return `${sign}$${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac ? '.' + frac : ''}`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtPrice(n: number): string {
  return Number.isInteger(n) ? `$${n}` : fmtUsd(n);
}

export function padEnd(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}
export function padStart(s: string, w: number): string {
  return s.length >= w ? s : ' '.repeat(w - s.length) + s;
}

/** Render rows as a fixed-width table. `align[i]` is 'l' or 'r'. */
export function table(header: string[], rows: string[][], align: ('l' | 'r')[], gap = 3): string[] {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (align[i] === 'r' ? padStart(c ?? '', widths[i]) : padEnd(c ?? '', widths[i])))
      .join(' '.repeat(gap))
      .replace(/\s+$/, '');
  return [line(header), ...rows.map(line)];
}

/** Local calendar date YYYY-MM-DD for an instant. */
export function localDate(d: Date | number): string {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
