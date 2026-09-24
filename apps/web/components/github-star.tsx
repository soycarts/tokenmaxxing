import { chipClass } from "@/components/chip";

const REPO = "soycarts/tokenmaxxing";

/** Star count from the GitHub API, cached for an hour at the edge; null when GitHub is unreachable. */
async function starCount(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "tokenmaxxing.fyi" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
}

function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k` : String(n);
}

/** "Star 1,708" chip next to the wordmark, like every open-source tool's header. Server component.
 *  `compact` drops the word and keeps icon + count, for the phone header. */
export async function GitHubStar({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const stars = await starCount();
  return (
    <a
      href={`https://github.com/${REPO}`}
      target="_blank"
      rel="noopener"
      aria-label={stars === null ? "Star tokenmaxxing on GitHub" : `Star tokenmaxxing on GitHub, ${stars} stars`}
      className={`${chipClass} flex-nowrap gap-2 whitespace-nowrap bg-surface text-ink ${compact ? "px-3" : ""} ${className}`}
    >
      <svg aria-hidden viewBox="0 0 16 16" className="h-[18px] w-[18px] shrink-0 fill-current">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
      {!compact && <span>Star</span>}
      {stars !== null && (
        <span className="num rounded-full bg-ink/10 px-2 py-0.5 text-[0.85rem] text-ink" title={`${stars.toLocaleString()} stars`}>
          {formatStars(stars)}
        </span>
      )}
    </a>
  );
}
