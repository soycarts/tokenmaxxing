/** Page shell for text pages: a shouted title, then a readable measure, left aligned. */
export function PageShell({ title, lede, children }: { title: string; lede?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 md:pt-16">
      <h1 className="display max-w-[14ch] text-[3.2rem] sm:text-7xl lg:text-[5.5rem]">{title}</h1>
      {lede && <div className="mt-5 max-w-[58ch] text-lg leading-relaxed text-ink-2">{lede}</div>}
      <div className="mt-12">{children}</div>
    </div>
  );
}

export function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="mt-16 first:mt-0">
      <h2 id={id} className="display text-3xl sm:text-4xl">
        {title}
      </h2>
      <div className="mt-4 max-w-[68ch] space-y-4 leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-md bg-gold-soft px-1.5 py-0.5 font-mono text-[0.84em] text-ink">{children}</code>;
}
