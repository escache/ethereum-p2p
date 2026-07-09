import fs from 'fs';
import path from 'path';
import { configPath, DEFAULT_CONFIG, type NexethConfig } from '../config/schema';

export function loadConfig(): NexethConfig {
  const file = configPath();
  if (!fs.existsSync(file)) return { ...DEFAULT_CONFIG };
  const raw = fs.readFileSync(file, 'utf8');
  return { ...DEFAULT_CONFIG, ...parseSimpleYaml(raw) };
}

export function initConfig(): string {
  const file = configPath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const yaml = [
    `apiUrl: ${DEFAULT_CONFIG.apiUrl}`,
    `portalUrl: ${DEFAULT_CONFIG.portalUrl}`,
    `securityModel: ${DEFAULT_CONFIG.securityModel}`,
    `json: false`,
    `chainA:`,
    `  type: simulated`,
    `  rpcUrl: http://127.0.0.1:8545`,
    `chainB:`,
    `  chainId: 424242`,
    `  dataDir: ~/.nexeth/chain-b`,
    `relayer:`,
    `  confirmations: 1`,
    `  pollIntervalMs: 500`,
  ].join('\n');

  fs.writeFileSync(file, yaml + '\n');
  return file;
}

/** Minimal YAML parser for flat nexeth config — no external deps */
function parseSimpleYaml(raw: string): Partial<NexethConfig> {
  const result: Record<string, unknown> = {};
  let section = '';

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (!line.startsWith(' ') && trimmed.endsWith(':')) {
      section = trimmed.slice(0, -1);
      continue;
    }

    const match = trimmed.match(/^(\w+):\s*(.+)$/);
    if (!match) continue;

    const [, key, value] = match;
    const parsed = value.replace(/^["']|["']$/g, '');

    if (section === 'chainA') {
      result.chainA = { ...(result.chainA as object), [key]: parsed };
    } else if (section === 'chainB') {
      result.chainB = {
        ...(result.chainB as object),
        [key]: key === 'chainId' ? Number(parsed) : parsed,
      };
    } else if (section === 'relayer') {
      result.relayer = {
        ...(result.relayer as object),
        [key]: Number(parsed),
      };
    } else if (key === 'json') {
      result.json = parsed === 'true';
    } else {
      result[key] = parsed;
    }
  }

  return result as Partial<NexethConfig>;
}
