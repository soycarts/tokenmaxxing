import { randomUUID } from 'node:crypto';
import { files } from './paths.js';
import { readJson, writeJsonAtomic, isFile } from './fsutil.js';
import { normalizePlans, type Plans } from './plans.js';
import type { SourceName } from './types.js';

export const DEFAULT_SITE = 'https://tokenmaxxing.fyi';

export const GRANULARITIES = ['hour', 'day', 'week'] as const;
export type Granularity = (typeof GRANULARITIES)[number];
export function isGranularity(s: string): s is Granularity {
  return (GRANULARITIES as readonly string[]).includes(s);
}

export interface SourceConfig {
  enabled: boolean;
  paths: string[];
}

export interface Config {
  version: 1;
  deviceId: string;
  sources: Record<SourceName, SourceConfig>;
  /** Per provider a list of plan lines. The legacy `{claude:"max-20x"}` form is normalised on load. */
  plans: Plans;
  site: {
    url: string;
    token?: string;
    handle?: string;
    lastPushedTs?: string;
    /** How coarse uploaded rows are. Coarser hides working hours. Default hour. */
    granularity?: Granularity;
    /** Granularity of the rows currently on the site for this device. */
    lastPushedGranularity?: Granularity;
  };
}

export function defaultConfig(): Config {
  return {
    version: 1,
    deviceId: randomUUID(),
    sources: {
      claude: { enabled: false, paths: [] },
      codex: { enabled: false, paths: [] },
      gemini: { enabled: false, paths: [] },
      cursor: { enabled: false, paths: [] },
    },
    plans: {},
    site: { url: DEFAULT_SITE },
  };
}

export function configExists(): boolean {
  return isFile(files.config());
}

export function loadConfig(): Config {
  const base = defaultConfig();
  const raw = readJson<Partial<Config> | null>(files.config(), null);
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    version: 1,
    deviceId: typeof raw.deviceId === 'string' && raw.deviceId ? raw.deviceId : base.deviceId,
    sources: { ...base.sources, ...(raw.sources ?? {}) },
    plans: normalizePlans(raw.plans),
    site: { ...base.site, ...(raw.site ?? {}) },
  };
}

export function saveConfig(cfg: Config): void {
  writeJsonAtomic(files.config(), cfg);
}

/** Site URL precedence: --site flag > TOKENMAXXING_SITE env > config.site.url > default. */
export function siteUrl(cfg: Config, flag?: string): string {
  const raw = flag || process.env.TOKENMAXXING_SITE || cfg.site.url || DEFAULT_SITE;
  return raw.replace(/\/+$/, '');
}
