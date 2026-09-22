import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  addLine, describeLines, normalizePlans, parsePlanSpec, parseQtyToken, plansMonthly, providerMonthly, roi, MONTH_DAYS,
} from '../dist/plans.js';
import { fmtPrice } from '../dist/format.js';
import { fakeHome, isolatedEnv, runCli } from './helpers.mjs';

const ENV = (home) => isolatedEnv(home, { TZ: 'UTC' });
const cfgPath = (home) => join(home, '.tokenmaxxing', 'config.json');

test('normalizePlans reads the legacy string shape and the list shape', () => {
  assert.deepEqual(normalizePlans({ claude: 'max-20x' }), { claude: [{ plan: 'max-20x', qty: 1 }] });
  assert.deepEqual(
    normalizePlans({ claude: [{ plan: 'max-20x', qty: 5 }, { plan: 'pro' }], openai: 'pro' }),
    { claude: [{ plan: 'max-20x', qty: 5 }, { plan: 'pro', qty: 1 }], openai: [{ plan: 'pro', qty: 1 }] },
  );
  // unknown providers, unknown plan ids, bad quantities and junk are dropped, never priced at $0
  assert.deepEqual(
    normalizePlans({
      evil: 'pro',
      claude: [{ plan: 'ultra', qty: 1 }, { plan: 'pro', qty: 0 }, { plan: 'pro', qty: 100 }, { plan: 'pro', qty: 1.5 }, { plan: 'pro', qty: '2' }, 'toString', null, 7],
      openai: 'enterprise',
      cursor: [],
    }),
    {},
  );
  assert.deepEqual(normalizePlans(null), {});
  assert.deepEqual(normalizePlans(['claude']), {});
});

test('duplicate plan ids merge by summing qty, capped at 99', () => {
  assert.deepEqual(normalizePlans({ claude: [{ plan: 'pro', qty: 2 }, { plan: 'max-20x', qty: 1 }, { plan: 'pro', qty: 3 }] }), {
    claude: [{ plan: 'pro', qty: 5 }, { plan: 'max-20x', qty: 1 }],
  });
  assert.deepEqual(normalizePlans({ claude: [{ plan: 'pro', qty: 60 }, { plan: 'pro', qty: 60 }] }), { claude: [{ plan: 'pro', qty: 99 }] });
  assert.deepEqual(addLine([{ plan: 'pro', qty: 2 }], { plan: 'pro', qty: 3 }), [{ plan: 'pro', qty: 5 }]);
  assert.match(addLine([{ plan: 'pro', qty: 98 }], { plan: 'pro', qty: 2 }), /would reach 100/);
});

test('custom lines: label and monthly are validated; only identical customs merge', () => {
  const c = (label, monthly, qty) => ({ plan: 'custom', label, monthly, ...(qty ? { qty } : {}) });
  assert.deepEqual(normalizePlans({ openai: [c('Codex $100 promo', 100)] }), { openai: [{ plan: 'custom', label: 'Codex $100 promo', monthly: 100, qty: 1 }] });
  assert.deepEqual(normalizePlans({ openai: [c('  ', 9.999)] }).openai, [{ plan: 'custom', label: 'Custom', monthly: 10, qty: 1 }]);
  assert.equal(normalizePlans({ openai: [c('x'.repeat(60), 5)] }).openai[0].label.length, 40);
  assert.deepEqual(normalizePlans({ openai: [c('a', 0), c('b', 10001), c('c', '5'), c('d', Infinity)] }), {});
  assert.deepEqual(normalizePlans({ openai: [c('a', 5), c('a', 5, 2), c('a', 6)] }).openai, [
    { plan: 'custom', label: 'a', monthly: 5, qty: 3 },
    { plan: 'custom', label: 'a', monthly: 6, qty: 1 },
  ]);
});

test('x5 / ×5 / --qty quantity parsing', () => {
  assert.equal(parseQtyToken('x5'), 5);
  assert.equal(parseQtyToken('X12'), 12);
  assert.equal(parseQtyToken('×3'), 3);
  for (const s of ['5', 'x', 'x5y', 'max-5x', '5x', 'x-1']) assert.equal(parseQtyToken(s), undefined, s);
  assert.deepEqual(parsePlanSpec('claude', ['max-20x', 'x5']), { plan: 'max-20x', qty: 5 });
  assert.deepEqual(parsePlanSpec('claude', ['max-20x'], '7'), { plan: 'max-20x', qty: 7 });
  assert.deepEqual(parsePlanSpec('claude', ['pro']), { plan: 'pro', qty: 1 });
  assert.match(parsePlanSpec('claude', ['pro', 'x0']), /1 to 99/);
  assert.match(parsePlanSpec('claude', ['pro', 'x100']), /1 to 99/);
  assert.match(parsePlanSpec('claude', ['pro'], 'many'), /1 to 99/);
  assert.match(parsePlanSpec('claude', ['pro', 'x2'], '2'), /once/);
  assert.match(parsePlanSpec('claude', ['ultra']), /must be one of: pro, max-5x, max-20x, team-standard, team-premium, or custom/);
  assert.match(parsePlanSpec('claude', ['pro', 'extra']), /unexpected argument: extra/);
  assert.deepEqual(parsePlanSpec('openai', ['custom', '100', 'Codex $100 promo']), { plan: 'custom', label: 'Codex $100 promo', monthly: 100, qty: 1 });
  assert.deepEqual(parsePlanSpec('openai', ['custom', '$12.50', 'x2', 'Two', 'words']), { plan: 'custom', label: 'Two words', monthly: 12.5, qty: 2 });
  assert.match(parsePlanSpec('openai', ['custom', 'lots']), /monthly amount/);
  assert.match(parsePlanSpec('openai', ['custom', '0']), /monthly amount/);
  assert.match(parsePlanSpec('openai', ['custom', '5', 'y'.repeat(41)]), /at most 40/);
});

test('ROI divides by the sum of every line', () => {
  const plans = normalizePlans({ claude: [{ plan: 'max-20x', qty: 5 }, { plan: 'pro', qty: 1 }], openai: [{ plan: 'custom', label: 'Codex', monthly: 100 }] });
  assert.equal(providerMonthly('claude', plans.claude), 1020);
  assert.equal(plansMonthly(plans), 1120);
  assert.equal(describeLines(plans.claude), '5× max-20x + 1× pro');
  assert.equal(describeLines(plans.openai), '1× Codex');
  assert.ok(Math.abs(roi(17224, 1020, MONTH_DAYS) - 16.886) < 0.001);
  assert.equal(plansMonthly(normalizePlans({ google: [{ plan: 'ai-pro', qty: 3 }] })), 59.97);
  assert.equal(fmtPrice(1020), '$1,020');
  assert.equal(fmtPrice(59.97), '$59.97');
});

test('plan add/list/remove on the CLI; report shows summed monthly per provider', async () => {
  const home = fakeHome();
  assert.equal((await runCli(['init'], ENV(home))).code, 0);
  assert.equal((await runCli(['plan', 'add', 'claude', 'max-20x', 'x5'], ENV(home))).code, 0);
  const add = await runCli(['plan', 'add', 'claude', 'pro'], ENV(home));
  assert.equal(add.stdout, 'claude: 5× max-20x + 1× pro = $1,020/mo\n');
  assert.equal((await runCli(['plan', 'add', 'openai', 'custom', '100', 'Codex $100'], ENV(home))).code, 0);
  const cfg = JSON.parse(readFileSync(cfgPath(home), 'utf8'));
  assert.deepEqual(cfg.plans, {
    claude: [{ plan: 'max-20x', qty: 5 }, { plan: 'pro', qty: 1 }],
    openai: [{ plan: 'custom', label: 'Codex $100', monthly: 100, qty: 1 }],
  });

  const list = await runCli(['plan', 'list'], ENV(home));
  assert.match(list.stdout, /^\* claude +5× max-20x +\$200 each +\$1,000\/mo\n +1× pro +\$20 each +\$20\/mo\n +claude total +\$1,020\/mo\n\* openai +1× Codex \$100 +\$100 each +\$100\/mo\n  cursor +none\n  google +none\n/);
  assert.match(list.stdout, /All plans: \$1,120\/mo/);

  const r = await runCli(['report', '--since', '2025-12-01', '--json'], ENV(home));
  const j = JSON.parse(r.stdout);
  const claude = j.plans.find((p) => p.provider === 'claude');
  assert.deepEqual(claude.lines, [{ plan: 'max-20x', qty: 5, monthly: 200 }, { plan: 'pro', qty: 1, monthly: 20 }]);
  assert.equal(claude.monthly, 1020);
  assert.equal(claude.source, 'claude');
  const claudeCost = j.rows.filter((x) => x.source === 'claude').reduce((s, x) => s + (x.cost ?? 0), 0);
  assert.ok(Math.abs(claude.api_equiv - claudeCost) < 1e-9);
  assert.ok(Math.abs(claude.roi - claudeCost / ((1020 * j.period.days) / 30.4375)) < 1e-9);
  const openai = j.plans.find((p) => p.provider === 'openai');
  assert.deepEqual(openai.lines, [{ plan: 'custom', qty: 1, monthly: 100, label: 'Codex $100' }]);

  const text = (await runCli(['report', '--since', '2025-12-01'], ENV(home))).stdout;
  assert.match(text, /Plans:  claude {2}5× max-20x \+ 1× pro {2}= \$1,020\/mo {2}→ API-equivalent \$[\d,.]+ {2}→ ROI \d+\.\d×/);
  assert.match(text, /\n {8}openai {2}1× Codex \$100 += \$100\/mo +→ API-equivalent/);
  assert.match(text, /\n {8}total +  = \$1,120\/mo/);

  assert.equal((await runCli(['plan', 'remove', 'claude', 'max-20x'], ENV(home))).stdout, 'claude: 1× pro = $20/mo\n');
  assert.equal((await runCli(['plan', 'set', 'claude', 'max-5x', '--qty', '2'], ENV(home))).stdout, 'claude: 2× max-5x = $200/mo\n');
  assert.equal((await runCli(['plan', 'remove', 'openai'], ENV(home))).stdout, 'Cleared openai plan.\n');
  const missing = await runCli(['plan', 'remove', 'claude', 'pro'], ENV(home));
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /claude has no pro line/);
  assert.deepEqual(JSON.parse(readFileSync(cfgPath(home), 'utf8')).plans, { claude: [{ plan: 'max-5x', qty: 2 }] });
});

test('a legacy config keeps working and is saved in the list shape on the next write', async () => {
  const home = fakeHome();
  assert.equal((await runCli(['init'], ENV(home))).code, 0);
  const cfg = JSON.parse(readFileSync(cfgPath(home), 'utf8'));
  cfg.plans = { claude: 'max-20x', openai: 'pro', google: 'retired-plan' };
  mkdirSync(join(home, '.tokenmaxxing'), { recursive: true });
  writeFileSync(cfgPath(home), JSON.stringify(cfg));
  const j = JSON.parse((await runCli(['report', '--since', '2025-12-01', '--json'], ENV(home))).stdout);
  assert.deepEqual(j.plans.map((p) => [p.provider, p.monthly]), [['claude', 200], ['openai', 200]]);
  // report is read-only: the file is untouched
  assert.equal(JSON.parse(readFileSync(cfgPath(home), 'utf8')).plans.claude, 'max-20x');
  assert.equal((await runCli(['plan', 'add', 'claude', 'pro'], ENV(home))).code, 0);
  assert.deepEqual(JSON.parse(readFileSync(cfgPath(home), 'utf8')).plans, {
    claude: [{ plan: 'max-20x', qty: 1 }, { plan: 'pro', qty: 1 }],
    openai: [{ plan: 'pro', qty: 1 }],
  });
});
