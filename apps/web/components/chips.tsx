import Link from "next/link";

/** A row of mutually exclusive links as small sticker chips; the chosen one is pressed in. */
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
    <nav aria-label={label} className="flex flex-wrap gap-2.5">
      {items.map((item) => {
        const on = item.value === active;
        return (
          <Link
            key={item.value}
            href={href(item.value)}
            aria-current={on ? "page" : undefined}
            scroll={false}
            className={`press display inline-flex h-9 items-center rounded-full px-3.5 text-[0.85rem] leading-none tracking-[0.04em] no-underline [--lift:3px] ${
              on ? "bg-ink text-paper" : "bg-surface text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
