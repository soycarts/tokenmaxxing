import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { SourceIcons } from "@/components/source-icons";
import type { LeaderboardRow } from "@/lib/data";
import { formatRoi, formatTokens, formatUsd } from "@/lib/format";
import type { Metric } from "@/lib/periods";

/** The four boards, each with its candy from the track. Volume is the one the mascot judges. */
export const TABS: { value: Metric; label: string; blurb: string; tone: string }[] = [
  { value: "value", label: "Value", tone: "bg-candy-butter", blurb: "API-equivalent dollars extracted. The default, and the point." },
  { value: "roi", label: "ROI", tone: "bg-candy-mint", blurb: "API-equivalent value divided by what the plans cost over the period. Only people who set a plan." },
  { value: "efficiency", label: "Efficiency", tone: "bg-candy-peri", blurb: "Output tokens per API-equivalent dollar, from $5 of usage up. Rewards getting words out, not re-reading context." },
  { value: "volume", label: "Volume (the tokenmaxxing board)", tone: "bg-candy-pink", blurb: "Raw tokens through the pipe. Mostly cache reads. Bragging rights, nothing more." },
];

/** Podium stickers for the top three; everyone else gets a plain number. */
export const MEDAL = ["bg-candy-butter", "bg-candy-pink", "bg-candy-mint"];

function primary(metric: Metric, r: LeaderboardRow): string {
  switch (metric) {
    case "roi":
      return formatRoi(r.roi);
    case "efficiency":
      return `${formatTokens(r.efficiency)}/$`;
    case "volume":
      return formatTokens(r.tokens_total);
    default:
      return formatUsd(r.api_equiv_usd);
  }
}

function secondary(metric: Metric, r: LeaderboardRow): string {
  switch (metric) {
    case "volume":
      return formatUsd(r.api_equiv_usd);
    case "roi":
      return `${formatUsd(r.api_equiv_usd)} on ${formatUsd(r.plan_usd)}`;
    default:
      return `${formatTokens(r.tokens_total)} tokens`;
  }
}

/**
 * A ranked board. `sponsor` (a SponsorRow) sits between the header band and rank 1, outside the
 * ordered list, so it is never numbered or counted as an entry.
 */
export function Board({ rows, metric, sponsor }: { rows: LeaderboardRow[]; metric: Metric; sponsor?: React.ReactNode }) {
  return (
    <div className="sticker overflow-hidden">
      <div aria-hidden="true" className="hidden grid-cols-[4rem_1fr_10rem_11rem_5rem] gap-4 bg-band px-5 py-3 text-on-band sm:grid">
        <span className="display text-sm tracking-[0.05em]">Rank</span>
        <span className="display text-sm tracking-[0.05em]">Who</span>
        <span className="display text-right text-sm tracking-[0.05em]">{TABS.find((t) => t.value === metric)!.label.split(" ")[0]}</span>
        <span className="display text-right text-sm tracking-[0.05em]">{metric === "volume" ? "Value" : metric === "roi" ? "Value on plan" : "Tokens"}</span>
        <span className="display text-right text-sm tracking-[0.05em]">Tools</span>
      </div>
      {sponsor}
      <ol className="divide-y-2 divide-line">
        {rows.map((r) => (
          <li
            key={r.handle}
            className="grid grid-cols-[2.75rem_1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3.5 sm:grid-cols-[4rem_1fr_10rem_11rem_5rem] sm:gap-4 sm:px-5"
          >
            <span className="row-span-2 sm:row-span-1">
              {r.rank <= 3 ? (
                <span
                  className={`display inline-flex h-9 w-9 items-center justify-center rounded-full border-[2.5px] border-edge text-lg text-on-gold ${MEDAL[r.rank - 1]}`}
                >
                  {r.rank}
                </span>
              ) : (
                <span className="display inline-block w-9 text-center text-lg text-muted">{r.rank}</span>
              )}
            </span>
            <Link href={`/u/${r.handle}`} className="flex min-w-0 items-center gap-2.5 font-semibold no-underline hover:underline">
              <Avatar src={r.avatar_url} name={r.handle} size={32} />
              <span className="truncate">{r.handle}</span>
            </Link>
            <span className="display text-right text-2xl leading-none sm:text-[1.7rem]">{primary(metric, r)}</span>
            <span className="num col-start-2 text-xs text-ink-2 sm:col-start-auto sm:text-right sm:text-sm">{secondary(metric, r)}</span>
            <span className="col-start-3 justify-self-end sm:col-start-auto">
              <SourceIcons sources={r.sources} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
