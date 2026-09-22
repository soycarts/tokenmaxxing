// Copies non-TS runtime assets (pricing snapshots, plans) from src/ to dist/.
import { copyFileSync, mkdirSync, chmodSync } from 'node:fs';

const assets = [
  'pricing/litellm.snapshot.json',
  'pricing/modelsdev.snapshot.json',
  'pricing/overrides.json',
  'plans.json',
];
for (const rel of assets) {
  const from = new URL(`../src/${rel}`, import.meta.url);
  const to = new URL(`../dist/${rel}`, import.meta.url);
  mkdirSync(new URL('.', to), { recursive: true });
  copyFileSync(from, to);
}
chmodSync(new URL('../dist/cli.js', import.meta.url), 0o755);
