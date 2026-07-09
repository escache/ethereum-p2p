/**
 * One-shot bridge demo — starts stack, runs transfer, exits.
 */
import { startBridgenet, runBridgeDemo } from './start';

async function main(): Promise<void> {
  const stack = startBridgenet();
  // Allow server to bind
  await new Promise((r) => setTimeout(r, 500));
  await runBridgeDemo(stack);

  // Keep alive briefly for portal inspection
  console.log('[demo] Stack running 30s — Ctrl+C to stop');
  await new Promise((r) => setTimeout(r, 30000));
  stack.server.close();
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
