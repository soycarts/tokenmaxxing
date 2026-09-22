import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fmtTokens, fmtUsd } from '../dist/format.js';
import { roi, MONTH_DAYS } from '../dist/plans.js';
import { parsePeriod } from '../dist/period.js';
import { loadBuckets, compactBuckets, appendBuckets } from '../dist/store.js';
import { emptyBucket, hourOf } from '../dist/bucket.js';
import { BoundedSet } from '../dist/dedup.js';
import { planPush, PUSH_BATCH, linkCode } from '../dist/site.js';
import { addCodexNotify, removeCodexNotify, addClaudeHook, removeClaudeHook } from '../dist/hook.js';
import { launchdPlist, cronLine } from '../dist/schedule.js';
import { lineDiff } from '../dist/prompt.js';
import { tmp } from './helpers.mjs';

test('number formatting', () => {
  assert.equal(fmtTokens(950), '950');
  assert.equal(fmtTokens(2900), '2.9k');
  assert.equal(fmtTokens(317_500_000), '317.5M');
  assert.equal(fmtTokens(23_080_000_000), '23.1B');
  assert.equal(fmtUsd(4476.25), '$4,476.25');
  assert.equal(fmtUsd(0.5), '$0.50');
});

test('ROI prorates the monthly price to the period', () => {
  assert.equal(MONTH_DAYS, 30.4375);
  assert.ok(Math.abs(roi(4360, 200, 30) - 4360 / ((200 * 30) / 30.4375)) < 1e-12);
});

test('periods use local calendar days', () => {
  const now = new Date(2026, 8, 22, 13, 0, 0);
  const p = parsePeriod('30d', now);
  assert.equal(p.sinceDate, '2026-08-23');
  assert.equal(p.untilDate, '2026-09-22');
  assert.equal(p.days, 30);
  assert.equal(parsePeriod('2026-09-15', now).days, 7);
  assert.throws(() => parsePeriod('lastweek', now));
});

test('hourOf floors to the UTC hour', () => {
  assert.equal(hourOf('2026-09-22T13:59:59.999Z'), '2026-09-22T13:00:00Z');
  assert.equal(hourOf('nope'), null);
});

test('buckets: last row per key wins; compaction keeps only those', async () => {
  const dir = tmp();
  const path = join(dir, 'buckets.jsonl');
  const a = { ...emptyBucket('2026-09-22T13:00:00Z', 'claude', 'm'), input: 1 };
  const b = { ...a, input: 5 };
  const c = { ...emptyBucket('2026-09-22T14:00:00Z', 'codex', 'x'), output: 2 };
  appendBuckets([a, c], path);
  appendBuckets([b], path);
  writeFileSync(path, readFileSync(path, 'utf8') + 'not json\n');
  const loaded = await loadBuckets(path);
  assert.equal(loaded.rows.size, 2);
  assert.equal(loaded.rows.get('2026-09-22T13:00:00Z|claude|m').input, 5);
  assert.equal(loaded.bad, 1);
  compactBuckets(loaded.rows, path);
  const again = await loadBuckets(path);
  assert.equal(again.lines, 2);
  assert.equal(again.rows.get('2026-09-22T13:00:00Z|claude|m').input, 5);
});

test('BoundedSet evicts least-recently-seen keys', () => {
  const s = new BoundedSet(3);
  for (const k of ['a', 'b', 'c']) s.add(k);
  assert.equal(s.add('a'), false); // refresh
  s.add('d');
  assert.deepEqual(s.toJSON(), ['c', 'a', 'd']);
});

test('push batches at 5000 rows and filters by lastPushedTs', () => {
  const rows = [];
  for (let i = 0; i < 12001; i++) rows.push(emptyBucket(new Date(Date.UTC(2026, 0, 1) + i * 3600e3).toISOString().slice(0, 13) + ':00:00Z', 'claude', 'm'));
  const plan = planPush(rows);
  assert.equal(PUSH_BATCH, 5000);
  assert.deepEqual(plan.batches.map((b) => b.length), [5000, 5000, 2001]);
  assert.equal(planPush(rows, rows[12000].ts).rows.length, 1);
  assert.match(linkCode(), /^[A-HJ-NP-Z2-9]{8}$/);
});

test('codex notify insertion is reversible and stays top-level', () => {
  for (const t of ['', 'model = "x"\n', 'model = "x"\n\n[profiles.a]\nk = 1\n', '# c\n[a]\nb = 2']) {
    const added = addCodexNotify(t);
    const firstTable = added.search(/^\s*\[/m);
    assert.ok(firstTable === -1 || added.indexOf('notify = [') < firstTable);
    assert.equal(removeCodexNotify(added), t);
  }
});

test('claude hook add/remove round-trips', () => {
  const s = { hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'other' }] }] }, x: 1 };
  assert.deepEqual(removeClaudeHook(addClaudeHook(s)), s);
  assert.deepEqual(removeClaudeHook(addClaudeHook({})), {});
});

test('schedule definitions run sync every 30 minutes', () => {
  const plist = launchdPlist('/opt/node/bin/npx', '/opt/node/bin', '/Users/x/.tokenmaxxing');
  assert.match(plist, /<integer>1800<\/integer>/);
  assert.match(plist, /<string>tokenmaxxing-cli<\/string>\n {4}<string>sync<\/string>/);
  assert.match(cronLine('/usr/bin/npx', '/usr/bin'), /^\*\/30 \* \* \* \* .*tokenmaxxing-cli sync --quiet/);
});

test('lineDiff marks additions and removals', () => {
  assert.equal(lineDiff('a\nb\n', 'a\nc\n'), '  a\n- b\n+ c');
});

test('report lists unpriced models with their override note', async () => {
  const { buildReport, renderReport } = await import('../dist/report.js');
  const { defaultConfig } = await import('../dist/config.js');
  const now = new Date();
  const ts = new Date(now.getTime() - 3600e3).toISOString().slice(0, 13) + ':00:00Z';
  const rows = [{ ...emptyBucket(ts, 'codex', 'codex-auto-review'), input: 1000 }, { ...emptyBucket(ts, 'codex', 'mystery-model'), input: 5 }];
  const rep = buildReport(rows, parsePeriod('7d', now), defaultConfig());
  assert.deepEqual(rep.unpriced, [
    { source: 'codex', model: 'codex-auto-review', tokens: 1000, note: 'bundled reviewer, no list price' },
    { source: 'codex', model: 'mystery-model', tokens: 5 },
  ]);
  assert.match(renderReport(rep), /Unpriced models \(0 tokens counted toward \$\): codex\/codex-auto-review \(1\.0k tokens — bundled reviewer, no list price\), codex\/mystery-model \(5 tokens\)/);
});

test('report lists a model listed at $0 upstream as unpriced with that note', async () => {
  const { buildReport, renderReport } = await import('../dist/report.js');
  const { defaultConfig } = await import('../dist/config.js');
  const { _setTables } = await import('../dist/pricing/index.js');
  _setTables({ litellm: { 'gemini-free-exp': { input_cost_per_token: 0, output_cost_per_token: 0 } }, modelsdev: {}, overrides: {} });
  try {
    const now = new Date();
    const ts = new Date(now.getTime() - 3600e3).toISOString().slice(0, 13) + ':00:00Z';
    const rep = buildReport([{ ...emptyBucket(ts, 'gemini', 'gemini-free-exp'), input: 700, output: 50 }], parsePeriod('7d', now), defaultConfig());
    assert.deepEqual(rep.unpriced, [{ source: 'gemini', model: 'gemini-free-exp', tokens: 750, note: 'listed at $0 upstream' }]);
    assert.equal(rep.rows[0].cost, null);
    assert.match(renderReport(rep), /gemini\/gemini-free-exp \(750 tokens — listed at \$0 upstream\)/);
  } finally {
    _setTables({ litellm: undefined, modelsdev: undefined, overrides: undefined });
  }
});

// --- push granularity ---
import { periodStart, foldRows } from '../dist/site.js';

test('periodStart aligns to hour, UTC day, and Monday-start week', () => {
  const ts = '2026-09-23T13:00:00Z'; // a Wednesday
  assert.equal(periodStart(ts, 'hour'), ts);
  assert.equal(periodStart(ts, 'day'), '2026-09-23T00:00:00Z');
  assert.equal(periodStart(ts, 'week'), '2026-09-21T00:00:00Z');
  assert.equal(periodStart('2026-09-21T00:00:00Z', 'week'), '2026-09-21T00:00:00Z'); // Monday stays
  assert.equal(periodStart('2026-09-20T23:00:00Z', 'week'), '2026-09-14T00:00:00Z'); // Sunday goes back
});

test('foldRows sums hourly rows into one row per period, source and model', () => {
  const mk = (ts, model, input) => ({ ...emptyBucket(ts, 'claude', model), input, output: 1, requests: 1 });
  const rows = [
    mk('2026-09-23T01:00:00Z', 'm1', 10),
    mk('2026-09-23T02:00:00Z', 'm1', 5),
    mk('2026-09-23T02:00:00Z', 'm2', 7),
    mk('2026-09-24T09:00:00Z', 'm1', 1),
  ];
  assert.equal(foldRows(rows, 'hour'), rows);
  const day = foldRows(rows, 'day');
  assert.deepEqual(day.map((r) => [r.ts, r.model, r.input, r.output, r.requests]), [
    ['2026-09-23T00:00:00Z', 'm1', 15, 2, 2],
    ['2026-09-23T00:00:00Z', 'm2', 7, 1, 1],
    ['2026-09-24T00:00:00Z', 'm1', 1, 1, 1],
  ]);
  const week = foldRows(rows, 'week');
  assert.deepEqual(week.map((r) => [r.ts, r.model, r.input]), [
    ['2026-09-21T00:00:00Z', 'm1', 16],
    ['2026-09-21T00:00:00Z', 'm2', 7],
  ]);
});

test('planPush with day granularity resends the whole current day and reports the hourly mark', () => {
  const mk = (ts) => ({ ...emptyBucket(ts, 'claude', 'm'), input: 1 });
  const rows = [mk('2026-09-23T01:00:00Z'), mk('2026-09-23T05:00:00Z'), mk('2026-09-24T02:00:00Z')];
  const plan = planPush(rows, '2026-09-23T05:00:00Z', 'day');
  assert.equal(plan.granularity, 'day');
  assert.deepEqual(plan.rows.map((r) => [r.ts, r.input]), [['2026-09-23T00:00:00Z', 2], ['2026-09-24T00:00:00Z', 1]]);
  assert.equal(plan.maxHourlyTs, '2026-09-24T02:00:00Z');
});
