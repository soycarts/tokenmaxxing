import Link from "next/link";

/** A row of mutually exclusive links styled as a segmented control. */
export function Chips<T extends string>({
  items,
  active,
  href,
  label,
}: {
  items: { value: T; label: string }[];
  active: T;
  href: (value: T) => string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const on = item.value === active;
        return (
          <Link
            key={item.value}
            href={href(item.value)}
            aria-current={on ? "page" : undefined}
            scroll={false}
            className={`rounded-full border px-3 py-1 text-sm no-underline transition-colors ${
              on ? "border-amber bg-amber-soft text-paper" : "border-line text-muted hover:border-line-strong hover:text-paper"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
