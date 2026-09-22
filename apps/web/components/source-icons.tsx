/**
 * Small generic glyphs per usage source (not the vendors' logos). Each has a title for
 * screen readers and hover.
 */
const LABEL: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  cursor: "Cursor",
};

function Glyph({ source }: { source: string }) {
  switch (source) {
    case "claude": // eight-point burst
      return <path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2" strokeWidth="1.6" strokeLinecap="round" />;
    case "codex": // hexagon
      return <path d="M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9z" strokeWidth="1.5" fill="none" strokeLinejoin="round" />;
    case "gemini": // four-point star
      return <path d="M8 1.5C8.6 5.6 10.4 7.4 14.5 8 10.4 8.6 8.6 10.4 8 14.5 7.4 10.4 5.6 8.6 1.5 8 5.6 7.4 7.4 5.6 8 1.5z" stroke="none" fill="currentColor" />;
    case "cursor": // pointer
      return <path d="M3.5 2.5l9 5-4 1-2 4.5z" strokeWidth="1.4" fill="none" strokeLinejoin="round" />;
    default:
      return <circle cx="8" cy="8" r="4" strokeWidth="1.5" fill="none" />;
  }
}

export function SourceIcons({ sources }: { sources: string[] | null | undefined }) {
  if (!sources?.length) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-muted">
      {sources.map((s) => (
        <svg key={s} viewBox="0 0 16 16" width="14" height="14" stroke="currentColor" role="img" aria-label={LABEL[s] ?? s}>
          <title>{LABEL[s] ?? s}</title>
          <Glyph source={s} />
        </svg>
      ))}
    </span>
  );
}

export function sourceLabel(s: string): string {
  return LABEL[s] ?? s;
}
