import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { hourOf } from '../bucket.js';
import type { Bucket, Usage } from '../types.js';
import { num, type ParseContext } from './context.js';

/** Gemini CLI chat files: ~/.gemini/tmp/<project-hash>/chats/*.json */
export async function geminiFiles(roots: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const root of roots) {
    const tmp = join(root, 'tmp');
    let projects: string[] = [];
    try {
      projects = await readdir(tmp);
    } catch {
      continue;
    }
    for (const p of projects.sort()) {
      const chats = join(tmp, p, 'chats');
      try {
        for (const n of (await readdir(chats)).sort()) if (n.endsWith('.json')) out.push(join(chats, n));
      } catch {
        /* not a project dir */
      }
    }
  }
  return out;
}

/** input excludes cached; tool-use and thought tokens are billed as output (reasoning kept for info). */
export function geminiUsage(t: any): Usage | null {
  const input = num(t?.input);
  const cached = num(t?.cached);
  const output = num(t?.output);
  const tool = num(t?.tool);
  const thoughts = num(t?.thoughts);
  const u: Usage = {
    input: Math.max(0, input - cached),
    cache_read: cached,
    cache_write_5m: 0,
    cache_write_1h: 0,
    output: output + tool + thoughts,
    reasoning: thoughts,
  };
  return u.input + u.cache_read + u.output === 0 ? null : u;
}

export async function parse(ctx: ParseContext): Promise<Bucket[]> {
  const { cursor, acc, stats } = ctx;
  for (const file of await geminiFiles(ctx.paths)) {
    stats.filesSeen++;
    let st;
    try {
      st = await stat(file);
    } catch {
      continue;
    }
    const prev = cursor.files[file];
    if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs) continue;
    stats.filesChanged++;
    let doc: any;
    try {
      // Gemini writes one JSON document per chat (not JSONL), so the file is parsed whole.
      doc = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      stats.badLines++;
      continue; // possibly mid-write; cursor untouched so we retry next sync
    }
    stats.bytesRead += st.size;
    const messages: any[] = Array.isArray(doc?.messages) ? doc.messages : [];
    let from = prev?.count ?? 0;
    if (messages.length < from) from = 0; // file shrank / rewritten
    const fallbackTs = doc?.lastUpdated ?? doc?.startTime ?? st.mtimeMs;
    let pending: string[] = [];
    let lastModel: string | undefined = prev?.model;
    for (let i = from; i < messages.length; i++) {
      const m = messages[i];
      if (!m || typeof m !== 'object') {
        stats.badLines++;
        continue;
      }
      const role = m.role ?? m.type;
      const hour = hourOf(m.timestamp ?? fallbackTs);
      if (!hour) continue;
      if (role === 'user') {
        pending.push(hour);
        continue;
      }
      const u = m.tokens ? geminiUsage(m.tokens) : null;
      if (!u) continue;
      const model = typeof m.model === 'string' && m.model ? m.model : 'gemini-unknown';
      lastModel = model;
      acc.addUsage(hour, 'gemini', model, u);
      for (const h of pending) acc.addConversation(h, 'gemini', model);
      pending = [];
    }
    // Prompts with no response yet are attributed to the last model seen (or gemini-unknown).
    for (const h of pending) acc.addConversation(h, 'gemini', lastModel ?? 'gemini-unknown');
    cursor.files[file] = { size: st.size, mtimeMs: st.mtimeMs, offset: st.size, count: messages.length, ...(lastModel ? { model: lastModel } : {}) };
  }
  return acc.rows();
}
