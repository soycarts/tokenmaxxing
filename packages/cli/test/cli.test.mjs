import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fakeHome, isolatedEnv, readBuckets, runCli, tmp } from './helpers.mjs';

const ENV = (home, extra) => isolatedEnv(home, { TZ: 'UTC', ...extra });
const cfgOf = (home) => JSON.parse(readFileSync(join(home, '.tokenmaxxing', 'config.json'), 'utf8'));

test('init: detects sources, writes config, syncs, prints report and the Next line', async () => {
  const home = fakeHome();
  const r = await runCli(['init', '--since', '2025-12-01'], ENV(home));
  assert.equal(r.code, 0, r.stderr);
  const cfg = cfgOf(home);
  assert.match(cfg.deviceId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(cfg.sources.claude.enabled, true);
  assert.equal(cfg.sources.codex.enabled, true);
  assert.equal(cfg.sources.gemini.enabled, true);
  assert.equal(cfg.sources.cursor.enabled, false);
  assert.equal(cfg.site.url, 'https://tokenmaxxing.fyi');
  assert.match(r.stdout, /tokenmaxxing · since 2025-12-01 · 2025-12-01 → \d{4}-\d{2}-\d{2} · pricing snapshot 2026-09-22/);
  assert.match(r.stdout, /claude\s+claude-fable-5\s+8\.7k\s+117\.9k\s+16\.4k\s+3\.3k\s+\$/);
  assert.match(r.stdout, /codex\s+gpt-6-astra\s+50\.6k\s+37\.8k\s+0\s+469\s+\$/);
  assert.match(r.stdout, /gemini\s+gemini-unknown\s+3\.0k\s+0\s+0\s+300\s+unpriced/);
  assert.match(r.stdout, /Unpriced models \(0 tokens counted toward \$\): gemini\/gemini-unknown \(3\.3k tokens\)/);
  assert.match(r.stdout, /Next: tokenmaxxing plan set <provider> <plan>  \(for ROI\)  ·  tokenmaxxing link  \(to publish\)\n$/);

  // deviceId survives a re-init
  const r2 = await runCli(['init'], ENV(home));
  assert.equal(r2.code, 0);
  assert.equal(cfgOf(home).deviceId, cfg.deviceId);
});

test('sync is incremental and appends replacement rows; the reader keeps the last row per key', async () => {
  const home = fakeHome();
  assert.equal((await runCli(['init'], ENV(home))).code, 0);
  const first = readBuckets(home);
  const r = await runCli(['sync'], ENV(home));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /→ 0 bucket rows/);
  assert.equal(readBuckets(home).lines, first.lines);

  const file = join(home, '.claude', 'projects', '-placeholder-project', 'session.jsonl');
  const extra = { type: 'assistant', requestId: 'req_fx_more', timestamp: '2026-07-05T00:59:00.000Z',
    message: { model: 'claude-fable-5', id: 'msg_fx_more', usage: { input_tokens: 100, output_tokens: 1, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 }, cache_creation_input_tokens: 0 } } };
  writeFileSync(file, readFileSync(file, 'utf8') + JSON.stringify(extra) + '\n');
  const q = await runCli(['sync', '--quiet'], ENV(home));
  assert.equal(q.code, 0);
  assert.equal(q.stdout, '');
  const after = readBuckets(home);
  assert.equal(after.lines, first.lines + 1);
  const row = after.rows.get('2026-07-05T00:00:00Z|claude|claude-fable-5');
  assert.equal(row.input, 8668 + 100);
  assert.equal(row.requests, 6);
  assert.deepEqual(Object.keys(row), ['v', 'ts', 'source', 'model', 'input', 'cache_read', 'cache_write_5m', 'cache_write_1h', 'output', 'reasoning', 'requests', 'conversations']);
});

test('sync ignores the JSON payload Codex notify appends', async () => {
  const home = fakeHome();
  const r = await runCli(['sync', '--quiet', '{"type":"agent-turn-complete"}'], ENV(home));
  assert.equal(r.code, 0, r.stderr);
});

test('report --json, --by, plans and ROI', async () => {
  const home = fakeHome();
  await runCli(['init'], ENV(home));
  assert.equal((await runCli(['plan', 'set', 'claude', 'max-20x'], ENV(home))).code, 0);
  assert.equal((await runCli(['plan', 'set', 'openai', 'pro'], ENV(home))).code, 0);
  const bad = await runCli(['plan', 'set', 'claude', 'ultra'], ENV(home));
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /must be one of: pro, max-5x, max-20x/);
  const r = await runCli(['report', '--since', '2025-12-01', '--json'], ENV(home));
  assert.equal(r.code, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(j).filter((k) => ['period', 'rows', 'totals', 'plans', 'unpriced'].includes(k)).sort(), ['period', 'plans', 'rows', 'totals', 'unpriced']);
  const claudeCost = j.rows.filter((x) => x.source === 'claude').reduce((s, x) => s + (x.cost ?? 0), 0);
  const plan = j.plans.find((p) => p.provider === 'claude');
  assert.equal(plan.price, 200);
  assert.ok(Math.abs(plan.cost - claudeCost) < 1e-9);
  assert.ok(Math.abs(plan.roi - claudeCost / ((200 * j.period.days) / 30.4375)) < 1e-9);
  assert.deepEqual(j.unpriced, [{ source: 'gemini', model: 'gemini-unknown', tokens: 3300 }]);
  const text = await runCli(['report', '--since', '2025-12-01'], ENV(home));
  assert.match(text.stdout, /Plans:  claude max-20x \$200\/mo → API-equivalent \$[\d,.]+ → ROI \d+\.\d×/);
  assert.match(text.stdout, /\n {8}openai pro {5}\$200\/mo → API-equivalent/);
  assert.match(text.stdout, /\n {8}total {10}\$400\/mo/);
  const byDay = JSON.parse((await runCli(['report', '--since', '2025-12-01', '--json', '--by', 'day'], ENV(home))).stdout);
  assert.deepEqual(byDay.rows.map((x) => x.day), ['2025-12-17', '2026-07-05', '2026-07-28', '2026-09-20', '2026-09-22']);
  const bySource = JSON.parse((await runCli(['report', '--since', '2025-12-01', '--json', '--by', 'source'], ENV(home))).stdout);
  assert.deepEqual(bySource.rows.map((x) => x.source), ['claude', 'codex', 'gemini']);
});

function fakeCcusage(dir, days) {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, 'ccusage');
  writeFileSync(p, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify({ daily: days }))});\n`);
  chmodSync(p, 0o755);
}
const bd = (modelName, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens) => ({ modelName, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, cost: 1 });

test('verify: passes when ccusage agrees, fails outside 1%, explains when ccusage is missing', async () => {
  const home = fakeHome({ codex: false, gemini: false });
  await runCli(['init'], ENV(home));
  const bin = join(home, 'bin');
  const nodeDir = process.execPath.replace(/\/node$/, '');
  fakeCcusage(bin, [
    { date: '2026-07-05', modelBreakdowns: [bd('claude-fable-5', 8668, 3341, 16422, 117941), bd('claude-opus-5-5', 10, 300, 1000, 2000), bd('<synthetic>', 0, 0, 0, 0)] },
    { date: '2026-07-28', modelBreakdowns: [bd('claude-opus-5', 4, 6, 20800, 38888)] },
  ]);
  const ok = await runCli(['verify', '--since', '2026-07-01'], ENV(home, { PATH: `${bin}:${nodeDir}:/usr/bin:/bin` }));
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /PASS — every token metric within 1% of ccusage/);
  assert.match(ok.stdout, /ccusage prices every cache write at the 5-minute rate/);

  fakeCcusage(bin, [{ date: '2026-07-05', modelBreakdowns: [bd('claude-fable-5', 8668, 3341, 16422, 150000)] }]);
  const bad = await runCli(['verify', '--since', '2026-07-01'], ENV(home, { PATH: `${bin}:${nodeDir}:/usr/bin:/bin` }));
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /FAIL — outside 1% tolerance: .*claude-fable-5 cache_read/);

  const missing = await runCli(['verify'], ENV(home, { PATH: `${nodeDir}:/usr/bin:/bin` }));
  assert.equal(missing.code, 0);
  assert.match(missing.stdout, /npm i -g ccusage/);
});

test('doctor and --version', async () => {
  const home = fakeHome();
  await runCli(['init'], ENV(home));
  const d = await runCli(['doctor'], ENV(home));
  assert.equal(d.code, 0, d.stderr);
  assert.match(d.stdout, /bundled snapshot 2026-09-22/);
  assert.match(d.stdout, /claude: enabled/);
  assert.match(d.stdout, /skipped garbled lines 1/);
  const v = await runCli(['--version'], ENV(home));
  assert.match(v.stdout, /^\d+\.\d+\.\d+\n$/);
});

// ---------- hooks (all under a temp HOME) ----------

test('hook install/uninstall: shows diff, needs --yes, backs up, is idempotent and reversible', async () => {
  const home = fakeHome({ codex: false, gemini: false });
  const settings = join(home, '.claude', 'settings.json');
  const original = JSON.stringify({ model: 'opus', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }] } }, null, 2) + '\n';
  writeFileSync(settings, original);
  mkdirSync(join(home, '.codex'), { recursive: true });
  const toml = 'model = "gpt-6-astra"\n\n[profiles.fast]\nmodel = "gpt-5.3-codex-spark"\n';
  writeFileSync(join(home, '.codex', 'config.toml'), toml);

  const dry = await runCli(['hook', 'install'], ENV(home));
  assert.equal(dry.code, 1);
  assert.match(dry.stdout, /\+ .*"command": "npx -y tokenmaxxing-cli sync --quiet"/);
  assert.match(dry.stdout, /\+ notify = \["npx","-y","tokenmaxxing-cli","sync","--quiet"\]/);
  assert.match(dry.stdout, /Re-run with --yes/);
  assert.equal(readFileSync(settings, 'utf8'), original);

  const r = await runCli(['hook', 'install', '--yes'], ENV(home));
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const s = JSON.parse(readFileSync(settings, 'utf8'));
  assert.deepEqual(s.hooks.Stop, [{ matcher: '', hooks: [{ type: 'command', command: 'npx -y tokenmaxxing-cli sync --quiet' }] }]);
  assert.deepEqual(s.hooks.PreToolUse, JSON.parse(original).hooks.PreToolUse);
  assert.equal(readFileSync(settings + '.tokenmaxxing.bak', 'utf8'), original);
  const newToml = readFileSync(join(home, '.codex', 'config.toml'), 'utf8');
  assert.ok(newToml.indexOf('notify = [') < newToml.indexOf('[profiles.fast]'), 'notify must stay a top-level key');

  const st = await runCli(['hook', 'status'], ENV(home));
  assert.match(st.stdout, /Claude Code Stop hook: installed/);
  assert.match(st.stdout, /Codex notify hook: {5}installed/);

  const again = await runCli(['hook', 'install', '--yes'], ENV(home));
  assert.match(again.stdout, /already installed/);
  assert.equal(JSON.parse(readFileSync(settings, 'utf8')).hooks.Stop.length, 1);

  const un = await runCli(['hook', 'uninstall', '--yes'], ENV(home));
  assert.equal(un.code, 0);
  assert.deepEqual(JSON.parse(readFileSync(settings, 'utf8')), JSON.parse(original));
  assert.equal(readFileSync(join(home, '.codex', 'config.toml'), 'utf8'), toml);
});

test('hook install leaves an existing Codex notify alone and prints instructions', async () => {
  const home = fakeHome({ claude: false, gemini: false });
  const toml = 'notify = ["my-notifier"]\n';
  writeFileSync(join(home, '.codex', 'config.toml'), toml);
  const r = await runCli(['hook', 'install', '--yes'], ENV(home));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /already has a `notify` command, so tokenmaxxing will not edit it/);
  assert.equal(readFileSync(join(home, '.codex', 'config.toml'), 'utf8'), toml);
  assert.equal(existsSync(join(home, '.claude', 'settings.json')), false);
});

// ---------- link / push against a local server ----------

function server(handler) {
  return new Promise((resolve) => {
    const reqs = [];
    const s = createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        reqs.push({ method: req.method, url: req.url, headers: req.headers, body });
        handler(req, res, reqs.length, body);
      });
    });
    s.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${s.address().port}`, reqs, close: () => new Promise((r) => s.close(r)) }));
  });
}

test('link: polls until the site returns { token, handle } and stores them', async () => {
  const home = fakeHome();
  await runCli(['init'], ENV(home));
  const srv = await server((req, res, n) => {
    if (!req.url.startsWith('/api/v1/link/')) return res.writeHead(404).end();
    if (n < 2) return res.writeHead(202).end();
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ token: 'tok_123', handle: 'maxxer' }));
  });
  try {
    const r = await runCli(['link', '--site', srv.url], ENV(home, { TOKENMAXXING_POLL_MS: '20' }));
    assert.equal(r.code, 0, r.stderr);
    const code = /link\?code=([A-Z2-9]{8}) and sign in/.exec(r.stdout)?.[1];
    assert.ok(code, r.stdout);
    assert.match(r.stdout, new RegExp(`^Open ${srv.url}/link\\?code=${code} and sign in`));
    assert.equal(srv.reqs[0].url, `/api/v1/link/${code}`);
    const cfg = cfgOf(home);
    assert.equal(cfg.site.token, 'tok_123');
    assert.equal(cfg.site.handle, 'maxxer');
    assert.equal(cfg.site.url, srv.url);
  } finally {
    await srv.close();
  }
});

test('link: clean errors on 404 and connection refused', async () => {
  const home = fakeHome();
  await runCli(['init'], ENV(home));
  const srv = await server((req, res) => res.writeHead(404).end());
  const r = await runCli(['link', '--site', srv.url], ENV(home, { TOKENMAXXING_POLL_MS: '20' }));
  await srv.close();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /tokenmaxxing: .*has no link endpoint yet .*404/);
  assert.doesNotMatch(r.stderr, /at .*\.js:\d+/, 'no stack trace');
  const refused = await runCli(['link', '--site', srv.url], ENV(home));
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /connection refused/);
  assert.equal(cfgOf(home).site.token, undefined);
});

test('push: requires link; sends only bucket rows with the bearer token; resumes from lastPushedTs', async () => {
  const home = fakeHome();
  await runCli(['init'], ENV(home));
  const notLinked = await runCli(['push'], ENV(home));
  assert.equal(notLinked.code, 1);
  assert.match(notLinked.stderr, /Not linked/);

  const srv = await server((req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}'));
  try {
    const cfgPath = join(home, '.tokenmaxxing', 'config.json');
    const cfg = cfgOf(home);
    cfg.site = { url: srv.url, token: 'tok_abc', handle: 'maxxer' };
    writeFileSync(cfgPath, JSON.stringify(cfg));
    const total = readBuckets(home).rows.size;

    const dry = await runCli(['push', '--dry-run'], ENV(home));
    assert.equal(dry.code, 0);
    assert.equal(srv.reqs.length, 0, 'dry run sends nothing');

    const r = await runCli(['push'], ENV(home));
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`Sending ${total} bucket rows \\(2025-12-17T05:00:00Z → 2026-09-22T06:00:00Z\\) in 1 request to POST ${srv.url}/api/v1/push`));
    assert.equal(srv.reqs.length, 1);
    const req = srv.reqs[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/v1/push');
    assert.equal(req.headers.authorization, 'Bearer tok_abc');
    const body = JSON.parse(req.body);
    assert.deepEqual(Object.keys(body), ['v', 'deviceId', 'rows']);
    assert.equal(body.v, 1);
    assert.equal(body.deviceId, cfg.deviceId);
    assert.equal(body.rows.length, total);
    for (const row of body.rows) {
      assert.deepEqual(Object.keys(row), ['v', 'ts', 'source', 'model', 'input', 'cache_read', 'cache_write_5m', 'cache_write_1h', 'output', 'reasoning', 'requests', 'conversations']);
    }
    assert.doesNotMatch(req.body, /placeholder|redacted|\/tmp|tmx-home/);
    assert.equal(cfgOf(home).site.lastPushedTs, '2026-09-22T06:00:00Z');

    // Second push re-sends only the last pushed hour (its row may have been replaced since).
    const r2 = await runCli(['push'], ENV(home));
    assert.equal(r2.code, 0);
    const body2 = JSON.parse(srv.reqs[1].body);
    assert.ok(body2.rows.every((x) => x.ts >= '2026-09-22T06:00:00Z'));
    assert.equal(body2.rows.length, 2);
  } finally {
    await srv.close();
  }
});

test('push: a missing endpoint is a clean error', async () => {
  const home = fakeHome();
  await runCli(['init'], ENV(home));
  const srv = await server((req, res) => res.writeHead(404).end());
  const cfg = cfgOf(home);
  cfg.site = { url: srv.url, token: 't' };
  writeFileSync(join(home, '.tokenmaxxing', 'config.json'), JSON.stringify(cfg));
  const r = await runCli(['push'], ENV(home));
  await srv.close();
  assert.equal(r.code, 1);
  assert.match(r.stderr, /has no push endpoint yet/);
  assert.equal(cfgOf(home).site.lastPushedTs, undefined);
});

test('unknown command exits 1 with help', async () => {
  const r = await runCli(['frobnicate'], ENV(tmp()));
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Unknown command: frobnicate/);
});
