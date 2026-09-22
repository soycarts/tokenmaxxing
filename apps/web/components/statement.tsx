/**
 * The hero's example report: what `tokenmaxxing init` prints, set as a sticker slapped on the
 * page. The numbers are an illustration (labelled as such), shaped exactly like the CLI's
 * report format.
 */
const ROWS = [
  { source: "claude", model: "claude-opus-5-5", tokens: "331.7M", usd: "$3,902.10" },
  { source: "claude", model: "claude-fable-5-1", tokens: "38.1M", usd: "$458.24" },
  { source: "codex", model: "gpt-6-astra", tokens: "9.8M", usd: "$115.91" },
];

export function Statement() {
  return (
    <div className="relative mx-auto w-full max-w-[26rem] md:rotate-[2.5deg]">
      <figure className="slap sticker relative px-5 pb-5 pt-5 sm:px-6">
        <span
          aria-hidden="true"
          className="display absolute -right-3 -top-5 rotate-[8deg] rounded-xl border-[2.5px] border-edge bg-accent px-3 py-2 text-sm leading-none tracking-[0.05em] text-on-accent shadow-[3px_3px_0_var(--edge)] sm:-right-5"
        >
          At API list rates
        </span>
        <figcaption className="flex items-baseline justify-between gap-3 border-b-2 border-dashed border-line pb-3">
          <span className="display text-lg tracking-[0.03em]">Example report</span>
          <span className="text-sm text-ink-2">last 30 days</span>
        </figcaption>

        <table className="mt-2 w-full text-[0.78rem] sm:text-[0.82rem]">
          <caption className="sr-only">API-equivalent cost by model</caption>
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="py-1.5 font-medium">Model</th>
              <th scope="col" className="py-1.5 text-right font-medium">Tokens</th>
              <th scope="col" className="py-1.5 text-right font-medium">At API rates</th>
            </tr>
          </thead>
          <tbody className="num">
            {ROWS.map((r) => (
              <tr key={r.model} className="border-t border-line">
                <td className="py-1.5 pr-2 font-mono text-[0.95em]">
                  <span className="hidden text-muted min-[420px]:inline">{r.source} </span>
                  {r.model}
                </td>
                <td className="py-1.5 text-right text-ink-2">{r.tokens}</td>
                <td className="py-1.5 text-right font-semibold">{r.usd}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="num mt-3 space-y-1 border-t-2 border-dashed border-line pt-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-2">Plans paid</dt>
            <dd>$400.00</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-2">API list price</dt>
            <dd className="font-semibold">$4,476.25</dd>
          </div>
        </dl>

        <p className="-mx-5 -mb-5 mt-4 flex items-end justify-between gap-4 rounded-b-[19px] border-t-[2.5px] border-edge bg-gold px-5 pb-4 pt-3 text-on-gold sm:-mx-6 sm:px-6">
          <span className="min-w-0 max-w-[9rem] pb-1 text-sm font-semibold leading-snug">Claude Max 20x, value per dollar paid</span>
          <span className="display shrink-0 text-[4.4rem] leading-[0.85] min-[400px]:text-[5.2rem] sm:text-[6.2rem]">21.8×</span>
        </p>
      </figure>
    </div>
  );
}
