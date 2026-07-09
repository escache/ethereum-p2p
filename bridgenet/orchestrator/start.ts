import path from 'path';
import { SimulatedChainA } from '../chain-a/simulated-chain';
import { AppChainB } from '../chain-b/app-chain';
import { BridgeRelayer } from '../relayer/relayer';
import { createBridgenetServer } from '../api/server';
import { ACCOUNTS } from '../shared/accounts';

export const RELAYER_ID = ACCOUNTS.relayer.address;
export const DEMO_SENDER = ACCOUNTS.alice.address;
export const DEMO_RECIPIENT = ACCOUNTS.bob.address;
export const DEFAULT_PORT = 3847;

export interface BridgenetStack {
  chainA: SimulatedChainA;
  chainB: AppChainB;
  relayer: BridgeRelayer;
  server: ReturnType<typeof createBridgenetServer>;
  port: number;
}

export function startBridgenet(port = DEFAULT_PORT): BridgenetStack {
  console.log('[bridgenet] Starting bridgenet stack…');

  const chainA = new SimulatedChainA();
  const chainB = new AppChainB(RELAYER_ID);
  const relayer = new BridgeRelayer(chainA, chainB, {
    confirmations: 1,
    pollIntervalMs: 300,
    securityModel: 'trusted-relayer',
    verbose: process.env.VERBOSE === '1' || process.env.VERBOSE === 'true',
  });

  // Seed demo accounts
  chainA.faucet(DEMO_SENDER, 10n * 10n ** 18n);

  relayer.start();

  const portalDir = path.join(__dirname, '../../portal/public');
  const server = createBridgenetServer({
    port,
    relayer,
    chainA,
    chainB,
    securityModel: 'trusted-relayer',
    portalDir,
  });

  console.log('[bridgenet] Security model: trusted-relayer');
  console.log(`[bridgenet] Portal: http://127.0.0.1:${port}`);
  console.log(`[bridgenet] API:    http://127.0.0.1:${port}/api/health`);

  return { chainA, chainB, relayer, server, port };
}

export async function runBridgeDemo(stack: BridgenetStack): Promise<void> {
  const amount = 1n * 10n ** 18n;
  console.log('\n[demo] === Bridge Demo: Chain A → Chain B ===');
  console.log(`[demo] Sender:    ${DEMO_SENDER}`);
  console.log(`[demo] Recipient: ${DEMO_RECIPIENT}`);
  console.log(`[demo] Amount:    1 ETH\n`);

  const balanceBefore = stack.chainB.getBalance(DEMO_RECIPIENT);
  console.log(`[demo] Chain B balance before: ${formatEth(balanceBefore)} ETH`);

  const lock = stack.chainA.lock(DEMO_SENDER, DEMO_RECIPIENT, amount);
  console.log(`[demo] Locked on Chain A — messageId=${lock.messageId.slice(0, 20)}…`);

  // Wait for relayer
  await waitForMessage(stack.relayer, lock.messageId, 10000);

  const msg = stack.relayer.getMessage(lock.messageId);
  const balanceAfter = stack.chainB.getBalance(DEMO_RECIPIENT);

  console.log(`[demo] Chain B balance after:  ${formatEth(balanceAfter)} ETH`);
  console.log(`[demo] Status: ${msg?.status ?? 'unknown'}`);

  if (msg?.status === 'minted') {
    console.log('\n[demo] ✓ Bridge demo complete — MINTED on Chain B');
    console.log(`[demo] View in portal: http://127.0.0.1:${stack.port}/`);
  } else {
    console.error('\n[demo] ✗ Bridge demo failed');
    process.exitCode = 1;
  }
}

async function waitForMessage(
  relayer: BridgeRelayer,
  messageId: string,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const msg = relayer.getMessage(messageId);
    if (msg && (msg.status === 'minted' || msg.status === 'failed')) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timeout waiting for relay');
}

function formatEth(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 4);
  return `${whole}.${frac}`;
}

// Run as standalone server when executed directly
if (require.main === module) {
  startBridgenet();
}
