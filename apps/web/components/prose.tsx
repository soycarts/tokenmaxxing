/** Page shell for text pages: a readable measure, left aligned. */
export function PageShell({ title, lede, children }: { title: string; lede?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <h1 className="max-w-[20ch] text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl">{title}</h1>
      {lede && <div className="mt-4 max-w-[62ch] text-lg leading-relaxed text-muted">{lede}</div>}
      <div className="mt-10">{children}</div>
    </div>
  );
}

export function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="mt-14 first:mt-0">
      <h2 id={id} className="text-xl font-bold tracking-tight">
        {title}
      </h2>
      <div className="mt-4 max-w-[68ch] space-y-4 leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-raised px-1.5 py-0.5 code-cond text-[0.82em] text-paper">{children}</code>;
}
