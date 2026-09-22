import type { Bucket } from '../types.js';
import type { ParseContext } from './context.js';

/**
 * Cursor: activity only, no tokens.
 *
 * ~/.cursor/ai-tracking/ai-code-tracking.db has no token counts (verified), so v1 reads nothing from it;
 * `init` reports Cursor as detected but excluded from totals. No sqlite dependency is added.
 *
 * TODO: if Cursor ever writes local token usage, parse it here (one file, fixture-tested like the others).
 */
export async function parse(_ctx: ParseContext): Promise<Bucket[]> {
  return [];
}
