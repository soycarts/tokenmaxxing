import Link from "next/link";
import type { Block, Inline } from "@/lib/markdown";

/** Renders lib/markdown.ts blocks in the site's text styles (the legal pages). */
function Inlines({ c }: { c: Inline[] }) {
  return (
    <>
      {c.map((n, i) => {
        switch (n.t) {
          case "text":
            return n.v;
          case "strong":
            return (
              <strong key={i} className="font-semibold text-ink">
                <Inlines c={n.c} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <Inlines c={n.c} />
              </em>
            );
          case "code":
            return (
              <code key={i} className="rounded-md bg-gold-soft px-1.5 py-0.5 font-mono text-[0.84em] text-ink">
                {n.v}
              </code>
            );
          case "link":
            return n.href.startsWith("/") ? (
              <Link key={i} href={n.href} className="font-semibold text-ink underline">
                <Inlines c={n.c} />
              </Link>
            ) : (
              <a key={i} href={n.href} className="font-semibold text-ink underline">
                <Inlines c={n.c} />
              </a>
            );
        }
      })}
    </>
  );
}

export function Markdown({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case "h":
            return b.level <= 2 ? (
              <h2 key={i} id={b.id} className="display mt-14 scroll-mt-8 text-3xl text-ink first:mt-0 sm:text-4xl">
                <Inlines c={b.c} />
              </h2>
            ) : (
              <h3 key={i} id={b.id} className="display mt-8 scroll-mt-8 text-2xl text-ink">
                <Inlines c={b.c} />
              </h3>
            );
          case "p":
            return (
              <p key={i} className="mt-4 leading-relaxed text-ink-2">
                <Inlines c={b.c} />
              </p>
            );
          case "ul":
          case "ol": {
            const List = b.t;
            return (
              <List
                key={i}
                className={`mt-4 space-y-2 pl-5 leading-relaxed text-ink-2 marker:text-ink ${b.t === "ol" ? "list-decimal marker:font-bold" : "list-disc"}`}
              >
                {b.items.map((item, j) => (
                  <li key={j} className="pl-1">
                    <Inlines c={item} />
                  </li>
                ))}
              </List>
            );
          }
          case "code":
            return (
              <pre key={i} className="mt-4 overflow-x-auto rounded-xl border-[2.5px] border-edge bg-surface px-4 py-3 font-mono text-[0.8rem] text-ink">
                {b.v}
              </pre>
            );
          case "hr":
            return <hr key={i} className="mt-10 border-t-2 border-dashed border-line" />;
        }
      })}
    </>
  );
}
