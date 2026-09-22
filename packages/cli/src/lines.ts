import { createReadStream } from 'node:fs';

export interface LineScan {
  /** Byte offset just past the last complete (newline-terminated) line. */
  end: number;
  /** Bytes after the last newline, if any (possibly a line still being written). */
  tail: Buffer | null;
}

const NL = 10;
const CR = 13;

/**
 * Stream `path` from byte `start` up to `endExclusive`, calling `onLine` for every newline-terminated line
 * (without the trailing \n / \r\n). Never loads the whole file: only the current chunk and any line that
 * spans chunks are held in memory.
 */
export async function scanLines(
  path: string,
  start: number,
  endExclusive: number,
  onLine: (line: Buffer) => void,
): Promise<LineScan> {
  if (endExclusive <= start) return { end: start, tail: null };
  const stream = createReadStream(path, { start, end: endExclusive - 1, highWaterMark: 1 << 20 });
  let pending: Buffer[] = [];
  let pendingLen = 0;
  let consumed = start; // offset of the first byte not yet emitted as part of a complete line
  let pos = start; // absolute offset of current chunk start

  for await (const chunk of stream as AsyncIterable<Buffer>) {
    let from = 0;
    let idx = chunk.indexOf(NL, from);
    while (idx !== -1) {
      let line: Buffer;
      if (pendingLen) {
        pending.push(chunk.subarray(from, idx));
        line = Buffer.concat(pending, pendingLen + (idx - from));
        pending = [];
        pendingLen = 0;
      } else {
        line = chunk.subarray(from, idx);
      }
      if (line.length && line[line.length - 1] === CR) line = line.subarray(0, line.length - 1);
      if (line.length) onLine(line);
      consumed = pos + idx + 1;
      from = idx + 1;
      idx = chunk.indexOf(NL, from);
    }
    if (from < chunk.length) {
      // Copy so we don't pin the 1MB chunk for a small tail.
      const rest = Buffer.from(chunk.subarray(from));
      pending.push(rest);
      pendingLen += rest.length;
    }
    pos += chunk.length;
  }
  const tail = pendingLen ? Buffer.concat(pending, pendingLen) : null;
  return { end: consumed, tail };
}

/** Cheap substring test on a raw line before paying for JSON.parse. */
export function has(line: Buffer, needle: Buffer): boolean {
  return line.indexOf(needle) !== -1;
}

export function parseLine(line: Buffer): any | undefined {
  try {
    return JSON.parse(line.toString('utf8'));
  } catch {
    return undefined;
  }
}
