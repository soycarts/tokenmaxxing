import { configExists, loadConfig, siteUrl } from './config.js';
import { loadCursors } from './cursors.js';
import { detect } from './detect.js';
import { fmtInt } from './format.js';
import { isDir, isFile } from './fsutil.js';
import { claudeSettingsPath, claudeHasHook, codexConfigPath, codexHasOurNotify } from './hook.js';
import { files, tmxHome } from './paths.js';
import { SNAPSHOT_DATE } from './pricing/index.js';
import { loadBuckets } from './store.js';
import { readFileSync } from 'node:fs';
import { SOURCES } from './types.js';

export async function doctor(version: string, log = console.log): Promise<number> {
  const cfg = loadConfig();
  const cursors = loadCursors();
  log(`tokenmaxxing-cli ${version} · node ${process.version} · ${process.platform}`);
  log(`home:     ${tmxHome()}${configExists() ? '' : '  (no config yet — run `tokenmaxxing init`)'}`);
  log(`pricing:  bundled snapshot ${SNAPSHOT_DATE} (LiteLLM + models.dev, overrides.json)`);
  log('');
  const det = detect();
  for (const s of SOURCES) {
    const sc = cfg.sources[s];
    const cur = cursors.sources[s];
    log(`${s}: ${sc?.enabled ? 'enabled' : 'disabled'}${det[s].found ? '' : ' · not detected on this machine'}`);
    for (const p of sc?.paths ?? []) log(`  path  ${p}  ${isDir(p) || isFile(p) ? 'found' : 'MISSING'}`);
    if (s === 'cursor' && det.cursor.found) log(`  note  ${det.cursor.note}`);
    if (cur) {
      const tracked = Object.keys(cur.files ?? {}).length;
      log(
        `  cursor  ${fmtInt(tracked)} files tracked · last sync ${cur.lastSync ?? 'never'} · last run scanned ${fmtInt(cur.lastFilesScanned ?? 0)}, changed ${fmtInt(cur.lastFilesChanged ?? 0)}`,
      );
      log(`          dedup keys ${fmtInt(cur.dedup?.length ?? 0)}${cur.convDedup ? ` · prompt keys ${fmtInt(cur.convDedup.length)}` : ''} · skipped garbled lines ${fmtInt(cur.badLines ?? 0)}`);
    }
  }
  log('');
  const b = await loadBuckets();
  log(`buckets:  ${files.buckets()} · ${fmtInt(b.bytes)} bytes · ${fmtInt(b.lines)} lines · ${fmtInt(b.rows.size)} current rows${b.bad ? ` · ${b.bad} invalid lines` : ''}`);
  let claudeHook = false;
  try {
    claudeHook = claudeHasHook(JSON.parse(isFile(claudeSettingsPath()) ? readFileSync(claudeSettingsPath(), 'utf8') : '{}'));
  } catch {
    /* ignore */
  }
  const codexHook = isFile(codexConfigPath()) && codexHasOurNotify(readFileSync(codexConfigPath(), 'utf8'));
  log(`hooks:    claude ${claudeHook ? 'installed' : 'not installed'} · codex ${codexHook ? 'installed' : 'not installed'}`);
  log(`site:     ${siteUrl(cfg)} · ${cfg.site.token ? `linked${cfg.site.handle ? ` as @${cfg.site.handle}` : ''}` : 'not linked'}${cfg.site.lastPushedTs ? ` · last pushed ${cfg.site.lastPushedTs}` : ''}`);
  return 0;
}
