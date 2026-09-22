/**
 * The hero's example report: what `tokenmaxxing init` prints, set as a statement. The numbers
 * are an illustration (labelled as such), shaped exactly like the CLI's report format.
 */
const ROWS = [
  { source: "claude", model: "claude-opus-5-5", tokens: "331.7M", usd: "$3,902.10" },
  { source: "claude", model: "claude-fable-5-1", tokens: "38.1M", usd: "$458.24" },
  { source: "codex", model: "gpt-6-astra", tokens: "9.8M", usd: "$115.91" },
];

export function Statement() {
  return (
    <figure className="print-in tear relative mx-auto w-full max-w-md bg-raised px-5 pb-10 pt-5 shadow-[0_30px_60px_-30px_#0008] sm:px-7">
      <figcaption className="flex items-baseline justify-between gap-3 border-b border-dashed border-line-strong pb-3 text-xs text-muted">
        <span>Example report</span>
        <span className="num">last 30 days</span>
      </figcaption>

      <table className="mt-3 w-full text-[0.72rem] sm:text-[0.78rem]">
        <caption className="sr-only">API-equivalent cost by model</caption>
        <thead>
          <tr className="text-left text-faint">
            <th scope="col" className="py-1 font-normal">Model</th>
            <th scope="col" className="py-1 text-right font-normal">Tokens</th>
            <th scope="col" className="py-1 text-right font-normal">At API rates</th>
          </tr>
        </thead>
        <tbody className="num [font-stretch:75%] sm:[font-stretch:87.5%]">
          {ROWS.map((r) => (
            <tr key={r.model} className="border-t border-line/60">
              <td className="py-1.5 pr-2">
                <span className="hidden text-faint min-[420px]:inline">{r.source} </span>
                {r.model}
              </td>
              <td className="py-1.5 text-right text-muted">{r.tokens}</td>
              <td className="py-1.5 text-right">{r.usd}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="num mt-4 space-y-1.5 border-t border-dashed border-line-strong pt-4 text-[0.78rem] sm:text-sm">
        <div className="flex justify-between gap-4">
          <dt className="font-sans text-muted">Plans paid</dt>
          <dd>$400.00</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="font-sans text-muted">API list price</dt>
          <dd className="text-amber">$4,476.25</dd>
        </div>
      </dl>

      <p className="mt-5 flex items-end justify-between gap-4">
        <span className="max-w-[9rem] text-xs leading-snug text-muted">Claude Max 20x, value per dollar paid</span>
        <span className="num text-5xl font-semibold leading-none tracking-[-0.04em] text-amber [font-stretch:87.5%] sm:text-6xl">
          21.8<span className="text-3xl sm:text-4xl">×</span>
        </span>
      </p>
    </figure>
  );
}
