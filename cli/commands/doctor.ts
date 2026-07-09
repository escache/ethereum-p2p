import type { NexethConfig } from '../config/schema';

export async function runDoctor(config: NexethConfig, json: boolean): Promise<number> {
  const checks: { name: string; ok: boolean; detail: string }[] = [];

  // Config file
  checks.push({ name: 'config', ok: true, detail: 'loaded' });

  // API health
  try {
    const res = await fetch(`${config.apiUrl}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const health = (await res.json()) as {
      relayer?: boolean;
      securityModel?: string;
      chains?: Array<{ name: string; healthy: boolean; blockHeight: number }>;
    };
    checks.push({ name: 'api', ok: true, detail: config.apiUrl });
    checks.push({
      name: 'relayer',
      ok: health.relayer === true,
      detail: health.relayer ? 'running' : 'stopped',
    });
    for (const chain of health.chains ?? []) {
      checks.push({
        name: chain.name,
        ok: chain.healthy,
        detail: `block ${chain.blockHeight}`,
      });
    }
    checks.push({
      name: 'security',
      ok: true,
      detail: health.securityModel ?? config.securityModel,
    });
  } catch (err) {
    checks.push({
      name: 'api',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    checks.push({
      name: 'hint',
      ok: false,
      detail: 'Run: npm run bridgenet',
    });
  }

  const allOk = checks.every((c) => c.ok || c.name === 'hint');

  if (json) {
    console.log(JSON.stringify({ healthy: allOk, checks }, null, 2));
  } else {
    console.log('\n  nexeth doctor\n');
    for (const c of checks) {
      const icon = c.ok ? '✓' : '✗';
      console.log(`  ${icon} ${c.name.padEnd(12)} ${c.detail}`);
    }
    console.log(allOk ? '\n  All checks passed.\n' : '\n  Some checks failed.\n');
  }

  return allOk ? 0 : 1;
}
