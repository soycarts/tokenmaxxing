/* eslint-disable @next/next/no-img-element -- live SVGs from our own routes */
import { CopyBox } from "@/components/copy-box";
import { Code } from "@/components/prose";
import { siteUrl } from "@/lib/env";

/** Ready-to-copy snippets for the card (README, any HTML page, iframe) and the small badge. */
export function embedSnippets(handle: string, base = siteUrl()) {
  const profile = `${base}/u/${handle}`;
  return {
    readme: `[![tokenmaxxing](${base}/card/${handle}.svg?size=sm&theme=auto)](${profile})`,
    html: `<a href="${profile}"><img src="${base}/card/${handle}.svg?size=md" alt="@${handle} on tokenmaxxing" width="480" height="160"></a>`,
    iframe: `<iframe src="${base}/embed/${handle}" width="480" height="160" style="border:0" loading="lazy" title="tokenmaxxing"></iframe>`,
    badge: `[![tokenmaxxing](${base}/badge/${handle}.svg?metric=value&period=month)](${profile})`,
  };
}

/** One card preview in the site's current theme (the embedded card itself follows the OS). */
function Preview({ handle, size, w, h }: { handle: string; size: "sm" | "md"; w: number; h: number }) {
  const alt = `@${handle} tokenmaxxing card, ${size}`;
  return (
    <div className="max-w-full" style={{ width: w }}>
      <img src={`/card/${handle}.svg?size=${size}&theme=light`} alt={alt} width={w} height={h} className="only-light h-auto w-full" />
      <img src={`/card/${handle}.svg?size=${size}&theme=dark`} alt={alt} width={w} height={h} className="only-dark h-auto w-full" />
    </div>
  );
}

export function EmbedPanel({ handle, isPublic }: { handle: string; isPublic: boolean }) {
  const s = embedSnippets(handle);
  return (
    <section aria-labelledby="embed" className="mt-14">
      <h2 id="embed" className="display text-3xl sm:text-4xl">
        Embed
      </h2>
      <p className="mt-2 max-w-[64ch] text-ink-2">
        Your card for a GitHub README or any web page. It follows the reader&apos;s light or dark mode and refreshes every
        minute.
      </p>
      {!isPublic && (
        <p className="mt-4 max-w-[64ch] rounded-xl border-[2.5px] border-edge bg-gold-soft px-4 py-3 text-sm font-medium">
          Cards and badges say &ldquo;private&rdquo; until your profile is public.
        </p>
      )}

      <div className="mt-7 grid gap-10 lg:grid-cols-[480px_minmax(0,1fr)] lg:items-start">
        <figure className="min-w-0">
          <Preview handle={handle} size="md" w={480} h={160} />
          <div className="mt-6">
            <Preview handle={handle} size="sm" w={320} h={96} />
          </div>
          <figcaption className="mt-5 max-w-[48ch] text-sm leading-relaxed text-ink-2">
            <Code>size=md</Code> is 480 by 160 with the last 30 days and your top models; <Code>size=sm</Code> is 320 by 96. Add{" "}
            <Code>period=week</Code> or <Code>all</Code>, and <Code>theme=light</Code> or <Code>dark</Code> to pin a theme.
          </figcaption>
        </figure>

        <div className="min-w-0 space-y-6">
          <CopyBox text={s.readme} label="README markdown" title="GitHub README" />
          <CopyBox text={s.html} label="HTML snippet" title="Any HTML page" />
          <CopyBox text={s.iframe} label="iframe snippet" title="As an iframe" />
        </div>
      </div>

      <div className="mt-12 max-w-3xl">
        <h3 className="display text-2xl">Or the small badge</h3>
        <p className="mt-2 text-ink-2">
          Shields-style, for a row of badges. Swap <Code>metric=value</Code> for <Code>roi</Code> or <Code>rank</Code>.
        </p>
        <img src={`/badge/${handle}.svg?metric=value&period=month`} alt={`tokenmaxxing badge for ${handle}`} height={20} className="mt-4 h-5" />
        <div className="mt-3">
          <CopyBox text={s.badge} label="badge markdown" compact />
        </div>
      </div>
    </section>
  );
}
