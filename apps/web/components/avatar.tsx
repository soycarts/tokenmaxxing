/* eslint-disable @next/next/no-img-element -- GitHub avatars are tiny and already CDN-sized */
export function Avatar({ src, name, size = 28 }: { src: string | null | undefined; name: string; size?: number }) {
  const initial = name.slice(0, 1).toUpperCase();
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-line text-xs font-bold text-muted"
        style={{ width: size, height: size }}
      >
        {initial}
      </span>
    );
  }
  const sized = src.includes("githubusercontent.com") ? `${src}${src.includes("?") ? "&" : "?"}s=${size * 2}` : src;
  return <img src={sized} alt="" width={size} height={size} className="shrink-0 rounded-full bg-line" loading="lazy" />;
}
