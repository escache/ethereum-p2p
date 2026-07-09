#!/usr/bin/env node
/**
 * Live two-client demo:
 *   1. Bob starts watching Chain B (recipient)
 *   2. Alice deposits on Chain A
 *   3. Full verbose transaction output
 *
 * Requires bridgenet server already running: npm run bridgenet
 */
import { spawn } from 'child_process';
import { loadConfig } from '../../cli/config/load';
import { ACCOUNTS } from '../shared/accounts';
import { formatEth } from '../shared/format';

const config = loadConfig();
const TS = 'TS_NODE_PROJECT=tsconfig.bridgenet.json';

async function main(): Promise<void> {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Nexeth Bridgenet — Live Two-Client Demo                 ║
╠══════════════════════════════════════════════════════════╣
║  Alice (depositor)  →  Chain A lock                      ║
║  Relayer            →  watches + mints on Chain B      ║
║  Bob (recipient)    →  watches Chain B for incoming mint ║
╚══════════════════════════════════════════════════════════╝
`);

  // Health check
  try {
    const res = await fetch(`${config.apiUrl}/api/health`);
    if (!res.ok) throw new Error('API not healthy');
    const health = (await res.json()) as { messageCount: number };
    console.log(`[live] Bridgenet online — ${health.messageCount} prior messages`);
    console.log(`[live] Portal: ${config.portalUrl}\n`);
  } catch {
    console.error('[live] ✗ Bridgenet not running. Start it first:\n');
    console.error('       npm run bridgenet\n');
    process.exit(1);
  }

  // Start Bob watcher in background
  console.log('[live] Starting Bob\'s Chain B watcher (background)…\n');
  const watcher = spawn(
    'npx',
    ['ts-node', 'cli/commands/watch-standalone.ts', '--as', 'bob'],
    {
      env: { ...process.env, TS_NODE_PROJECT: 'tsconfig.bridgenet.json' },
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  watcher.stdout?.on('data', (d) => process.stdout.write(d));
  watcher.stderr?.on('data', (d) => process.stderr.write(d));

  await sleep(1500);

  // Alice deposits
  console.log('\n[live] Alice submitting real lock transaction on Chain A…\n');
  const amount = 2n * 10n ** 18n;

  const balBefore = await getBalance('b', ACCOUNTS.bob.address);
  console.log(`[live] Bob Chain B balance before: ${formatEth(balBefore)} ETH\n`);

  const res = await fetch(`${config.apiUrl}/api/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: ACCOUNTS.alice.address,
      recipient: ACCOUNTS.bob.address,
      amount: amount.toString(),
    }),
  });

  const lock = (await res.json()) as {
    messageId: string;
    txHash: string;
    blockNumber: number;
    amount: string;
    error?: string;
  };
  if (!res.ok) {
    console.error('[live] Lock failed:', lock.error);
    watcher.kill();
    process.exit(1);
  }

  console.log('[live] LOCKED on Chain A');
  console.log(`       messageId: ${lock.messageId}`);
  console.log(`       txHash:    ${lock.txHash}`);
  console.log(`       block:     #${lock.blockNumber}`);
  console.log(`       amount:    ${formatEth(BigInt(lock.amount))} ETH\n`);

  // Wait for mint
  const msg = await waitForMint(lock.messageId, 15000);
  await sleep(1000);

  const balAfter = await getBalance('b', ACCOUNTS.bob.address);
  console.log(`\n[live] Bob Chain B balance after:  ${formatEth(balAfter)} ETH`);
  console.log(`[live] Status: ${msg?.status ?? 'timeout'}`);

  if (msg?.status === 'minted') {
    console.log(`\n[live] ✓ Full transfer complete`);
    console.log(`[live] Chain B tx: ${msg.chainBTxHash}`);
    console.log(`\n[live] Full details: npm run nexeth -- bridge tx ${lock.messageId}`);
  }

  watcher.kill();
  process.exit(msg?.status === 'minted' ? 0 : 1);
}

async function getBalance(chain: string, address: string): Promise<bigint> {
  const res = await fetch(`${config.apiUrl}/api/balance?chain=${chain}&address=${address}`);
  const data = (await res.json()) as { balance: string };
  return BigInt(data.balance);
}

async function waitForMint(messageId: string, timeout: number): Promise<{
  status: string;
  chainBTxHash?: string;
} | null> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await fetch(`${config.apiUrl}/api/messages/${messageId}`);
    if (res.ok) {
      const msg = (await res.json()) as { status: string; chainBTxHash?: string };
      if (msg.status === 'minted' || msg.status === 'failed') return msg;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
