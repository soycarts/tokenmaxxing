// Copies the repo's legal docs and agent skill into apps/web/content/, where the site reads
// them at build time. The copies are committed, so a build that only has apps/web (a Vercel
// root-directory deploy) still has them; lib/content.test.ts fails when a copy is stale.
//
//   npm run sync-content        (also runs before every `npm run build`)
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(web, "../..");

export const SOURCES = {
  "PRIVACY.md": "docs/legal/PRIVACY.md",
  "TERMS.md": "docs/legal/TERMS.md",
  "SKILL.md": "skills/tokenmaxxing/SKILL.md",
};

mkdirSync(resolve(web, "content"), { recursive: true });
for (const [name, rel] of Object.entries(SOURCES)) {
  const from = resolve(root, rel);
  const to = resolve(web, "content", name);
  if (!existsSync(from)) {
    console.log(`sync-content: ${rel} not found, keeping the committed content/${name}`);
    continue;
  }
  if (existsSync(to) && readFileSync(to, "utf8") === readFileSync(from, "utf8")) continue;
  copyFileSync(from, to);
  console.log(`sync-content: ${rel} -> content/${name}`);
}
