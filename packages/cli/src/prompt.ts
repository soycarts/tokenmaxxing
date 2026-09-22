import { createInterface } from 'node:readline/promises';

/** Ask a yes/no question on the TTY. Non-interactive stdin answers "no". */
export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const a = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
    return a === 'y' || a === 'yes';
  } finally {
    rl.close();
  }
}

/** Minimal line diff (LCS) for showing exactly what an edit changes. */
export function lineDiff(before: string, after: string): string {
  const a = before === '' ? [] : before.replace(/\n$/, '').split('\n');
  const b = after === '' ? [] : after.replace(/\n$/, '').split('\n');
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) {
      out.push(`- ${a[i++]}`);
    } else {
      out.push(`+ ${b[j++]}`);
    }
  }
  // Keep 3 lines of context around changes.
  const keep = new Set<number>();
  out.forEach((l, k) => {
    if (l[0] !== ' ') for (let d = -3; d <= 3; d++) keep.add(k + d);
  });
  const res: string[] = [];
  let skipped = false;
  out.forEach((l, k) => {
    if (keep.has(k)) {
      res.push(l);
      skipped = false;
    } else if (!skipped) {
      res.push('  …');
      skipped = true;
    }
  });
  return res.join('\n');
}
