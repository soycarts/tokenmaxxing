import { cpSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const here = dirname(fileURLToPath(import.meta.url));
export const FIX = join(here, 'fixtures');
export const CLI = join(here, '..', 'dist', 'cli.js');

export function tmp(prefix = 'tmx-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** A fake $HOME laid out like a real machine, populated from the fixtures. */
export function fakeHome({ claude = true, codex = true, gemini = true } = {}) {
  const home = tmp('tmx-home-');
  if (claude) {
    const p = join(home, '.claude', 'projects', '-placeholder-project');
    mkdirSync(join(p, 'session', 'subagents'), { recursive: true });
    cpSync(join(FIX, 'claude', 'session.jsonl'), join(p, 'session.jsonl'));
    cpSync(join(FIX, 'claude', 'subagents', 'agent-x.jsonl'), join(p, 'session', 'subagents', 'agent-x.jsonl'));
  }
  if (codex) {
    const s = join(home, '.codex', 'sessions', '2026', '09', '21');
    mkdirSync(s, { recursive: true });
    cpSync(join(FIX, 'codex', 'rollout-2026.jsonl'), join(s, 'rollout-2026.jsonl'));
    mkdirSync(join(home, '.codex', 'archived_sessions'), { recursive: true });
    cpSync(join(FIX, 'codex', 'rollout-2025.jsonl'), join(home, '.codex', 'archived_sessions', 'rollout-2025.jsonl'));
  }
  if (gemini) {
    const g = join(home, '.gemini', 'tmp', 'placeholder-hash', 'chats');
    mkdirSync(g, { recursive: true });
    cpSync(join(FIX, 'gemini', 'chats', 'x.json'), join(g, 'x.json'));
  }
  return home;
}

/** Environment that isolates the CLI from the real machine. */
export function isolatedEnv(home, extra = {}) {
  const env = { ...process.env, HOME: home, TOKENMAXXING_HOME: join(home, '.tokenmaxxing'), ...extra };
  delete env.CLAUDE_CONFIG_DIR;
  delete env.CODEX_HOME;
  delete env.TOKENMAXXING_SITE;
  for (const [k, v] of Object.entries(extra)) if (v === undefined) delete env[k];
  return env;
}

export function runCli(args, env, input) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

export function readBuckets(home) {
  const text = readFileSync(join(home, '.tokenmaxxing', 'buckets.jsonl'), 'utf8');
  const rows = new Map();
  for (const l of text.split('\n').filter(Boolean)) {
    const r = JSON.parse(l);
    rows.set(`${r.ts}|${r.source}|${r.model}`, r);
  }
  return { rows, lines: text.split('\n').filter(Boolean).length };
}
