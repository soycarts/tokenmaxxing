// SPEC non-negotiable: the CLI never reads credentials. Any of these strings anywhere in src/ fails the build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { here } from './helpers.mjs';

const FORBIDDEN = /Keychain|credentials|auth\.json|state\.vscdb|accessToken|api2\.cursor|cursor\.com/;

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

test('src/ never references credential stores or provider APIs', () => {
  const src = join(here, '..', 'src');
  const hits = [];
  let scanned = 0;
  for (const f of walk(src)) {
    scanned++;
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        const m = FORBIDDEN.exec(line);
        if (m) hits.push(`${f.slice(src.length + 1)}:${i + 1}: ${m[0]}`);
      });
  }
  assert.ok(scanned > 10, 'expected to scan the source tree');
  assert.deepEqual(hits, []);
});

test('the grep itself catches a planted hit', () => {
  assert.ok(FORBIDDEN.test('readFileSync("~/.codex/auth.json")'));
  assert.ok(FORBIDDEN.test('security find-generic-password # Keychain'));
});
