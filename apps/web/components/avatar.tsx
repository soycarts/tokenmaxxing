/* eslint-disable @next/next/no-img-element -- GitHub avatars are tiny and already CDN-sized */
export function Avatar({ src, name, size = 28 }: { src: string | null | undefined; name: string; size?: number }) {
  const initial = name.slice(0, 1).toUpperCase();
  const ring = "shrink-0 rounded-full border-2 border-edge";
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={`${ring} display inline-flex items-center justify-center bg-candy-peri text-on-gold`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        {initial}
      </span>
    );
  }
  const sized = src.includes("githubusercontent.com") ? `${src}${src.includes("?") ? "&" : "?"}s=${size * 2}` : src;
  return <img src={sized} alt="" width={size} height={size} className={`${ring} bg-line`} style={{ width: size, height: size }} loading="lazy" />;
}
