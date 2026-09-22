import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { SourceIcons } from "@/components/source-icons";
import type { LeaderboardRow } from "@/lib/data";
import { formatRoi, formatTokens, formatUsd } from "@/lib/format";
import type { Metric } from "@/lib/periods";

export const TABS: { value: Metric; label: string; blurb: string }[] = [
  { value: "value", label: "Value", blurb: "API-equivalent dollars extracted. The default, and the point." },
  { value: "roi", label: "ROI", blurb: "API-equivalent value divided by what the plans cost over the period. Only people who set a plan." },
  { value: "efficiency", label: "Efficiency", blurb: "Output tokens per API-equivalent dollar, from $5 of usage up. Rewards getting words out, not re-reading context." },
  { value: "volume", label: "Volume (the tokenmaxxing board)", blurb: "Raw tokens through the pipe. Mostly cache reads. Bragging rights, nothing more." },
];

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

export function Board({ rows, metric }: { rows: LeaderboardRow[]; metric: Metric }) {
  return (
    <ol className="divide-y divide-line border-y border-line">
      <li aria-hidden="true" className="hidden grid-cols-[3.5rem_1fr_10rem_11rem_5rem] gap-4 py-2.5 text-xs text-faint sm:grid">
        <span>Rank</span>
        <span>Who</span>
        <span className="text-right">{TABS.find((t) => t.value === metric)!.label.split(" ")[0]}</span>
        <span className="text-right">{metric === "volume" ? "Value" : metric === "roi" ? "Value on plan" : "Tokens"}</span>
        <span className="text-right">Tools</span>
      </li>
      {rows.map((r) => (
        <li
          key={r.handle}
          className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 gap-y-1 py-3 sm:grid-cols-[3.5rem_1fr_10rem_11rem_5rem] sm:gap-4"
        >
          <span className={`num row-span-2 text-sm sm:row-span-1 ${r.rank <= 3 ? "text-amber" : "text-faint"}`}>
            {String(r.rank).padStart(2, "0")}
          </span>
          <Link href={`/u/${r.handle}`} className="flex min-w-0 items-center gap-2.5 no-underline hover:text-amber">
            <Avatar src={r.avatar_url} name={r.handle} />
            <span className="truncate font-medium">{r.handle}</span>
          </Link>
          <span className="num text-right text-base font-semibold sm:text-lg">{primary(metric, r)}</span>
          <span className="num col-start-2 text-xs text-muted sm:col-start-auto sm:text-right sm:text-sm">{secondary(metric, r)}</span>
          <span className="col-start-3 justify-self-end sm:col-start-auto">
            <SourceIcons sources={r.sources} />
          </span>
        </li>
      ))}
    </ol>
  );
}

