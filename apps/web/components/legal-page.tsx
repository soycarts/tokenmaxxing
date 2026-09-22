import { Markdown } from "@/components/markdown";
import type { LegalDoc } from "@/lib/content";
import { parseMarkdown } from "@/lib/markdown";

/** /privacy and /terms: the repo's docs/legal text, dated by its own first line. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const blocks = parseMarkdown(doc.body);
  const sections = blocks.filter((b) => b.t === "h" && b.level === 2) as Extract<(typeof blocks)[number], { t: "h" }>[];

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 md:pt-16">
      <h1 className="display max-w-[14ch] text-[3.2rem] sm:text-7xl lg:text-[5.5rem]">{doc.title}</h1>
      {doc.effective && <p className="mt-5 text-lg text-ink-2">Effective {doc.effective}</p>}

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,68ch)_minmax(0,1fr)]">
        <article className="min-w-0">
          <Markdown blocks={blocks} />
        </article>
        {sections.length > 3 && (
          <nav aria-label="Sections" className="hidden lg:block">
            <ol className="sticky top-8 space-y-2 border-l-[2.5px] border-edge pl-5 text-sm">
              {sections.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} className="text-ink-2 no-underline hover:text-ink hover:underline">
                    {h.text}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
      </div>
    </div>
  );
}
