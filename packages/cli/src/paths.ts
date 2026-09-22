import { homedir } from 'node:os';
import { join } from 'node:path';

export function home(): string {
  return process.env.HOME || homedir();
}

export function tmxHome(): string {
  return process.env.TOKENMAXXING_HOME || join(home(), '.tokenmaxxing');
}

export const files = {
  config: () => join(tmxHome(), 'config.json'),
  buckets: () => join(tmxHome(), 'buckets.jsonl'),
  cursors: () => join(tmxHome(), 'cursors.json'),
  lock: () => join(tmxHome(), 'sync.lock'),
  cacheDir: () => join(tmxHome(), 'cache'),
};

/** Claude Code roots: CLAUDE_CONFIG_DIR (comma separated) else ~/.config/claude and ~/.claude. */
export function claudeCandidateRoots(): string[] {
  const env = process.env.CLAUDE_CONFIG_DIR;
  if (env && env.trim()) {
    return env.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [join(home(), '.config', 'claude'), join(home(), '.claude')];
}

export function codexHome(): string {
  return process.env.CODEX_HOME || join(home(), '.codex');
}

export function geminiHome(): string {
  return join(home(), '.gemini');
}

export function cursorTrackingDb(): string {
  return join(home(), '.cursor', 'ai-tracking', 'ai-code-tracking.db');
}
