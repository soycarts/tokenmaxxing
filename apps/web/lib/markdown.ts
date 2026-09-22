/**
 * A deliberately small markdown parser for the documents this site renders (the legal pages):
 * ATX headings, paragraphs, bullet and numbered lists, fenced code, rules, and inline bold,
 * *italics* (asterisks only, so snake_case survives), code and links. Anything else renders as plain text. No HTML passthrough, ever.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "h"; level: number; id: string; c: Inline[]; text: string }
  | { t: "p"; c: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "code"; v: string }
  | { t: "hr" };

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_[\]()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Only relative links, fragments, https and mailto survive; anything else becomes text. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^(\/(?!\/)|#)/.test(h)) return h;
  if (/^https:\/\/[^\s]+$/i.test(h) || /^mailto:[^\s]+$/i.test(h)) return h;
  return null;
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^`([^`]+)`/.exec(rest))) {
      flush();
      out.push({ t: "code", v: m[1] });
    } else if ((m = /^\*\*(.+?)\*\*/.exec(rest))) {
      flush();
      out.push({ t: "strong", c: parseInline(m[1]) });
    } else if ((m = /^\*(?!\s)(.+?)(?<!\s)\*/.exec(rest))) {
      flush();
      out.push({ t: "em", c: parseInline(m[1]) });
    } else if ((m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest))) {
      flush();
      const href = safeHref(m[2]);
      if (href) out.push({ t: "link", href, c: parseInline(m[1]) });
      else out.push(...parseInline(m[1]));
    } else {
      text += src[i];
      i++;
      continue;
    }
    i += m[0].length;
  }
  flush();
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  const ids = new Map<string, number>();
  let i = 0;
  const isList = (l: string) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(l);
  const isBlockStart = (l: string) => /^(#{1,6})\s/.test(l) || /^```/.test(l) || /^(?:-{3,}|\*{3,})\s*$/.test(l) || isList(l);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      const text = m[2];
      let id = slugify(text) || "section";
      const n = ids.get(id) ?? 0;
      ids.set(id, n + 1);
      if (n) id = `${id}-${n + 1}`;
      blocks.push({ t: "h", level: m[1].length, id, c: parseInline(text), text: text.replace(/[*`]/g, "") });
      i++;
    } else if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ t: "code", v: body.join("\n") });
    } else if (/^(?:-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ t: "hr" });
      i++;
    } else if (isList(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && lines[i].trim()) {
        const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (item) items.push(item[1]);
        else if (items.length) items[items.length - 1] += ` ${lines[i].trim()}`;
        i++;
      }
      blocks.push({ t: ordered ? "ol" : "ul", items: items.map(parseInline) });
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) para.push(lines[i++].trim());
      blocks.push({ t: "p", c: parseInline(para.join(" ")) });
    }
  }
  return blocks;
}
