import type { NexethConfig } from '../config/schema';
import { resolveAccount, ACCOUNTS } from '../../bridgenet/shared/accounts';
import { formatEth } from '../../bridgenet/shared/format';
import {
  logClientBanner,
  logGethInfo,
  logTxReceipt,
  logBalanceChange,
  logBridgeMessage,
} from '../../bridgenet/shared/verbose';
import type { BridgeMessage, TimelineEvent } from '../../bridgenet/shared/types';
import type { TxReceipt } from '../../bridgenet/shared/tx-types';

function getArg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Person A — deposits on Chain A via API (real lock transaction) */
export async function runClientDeposit(config: NexethConfig, args: string[]): Promise<number> {
  const fromName = getArg(args, '--from') ?? 'alice';
  const toName = getArg(args, '--to') ?? 'bob';
  const amountEth = getArg(args, '--amount') ?? '1';
  const verbose = args.includes('--verbose') || args.includes('-v');

  const sender = resolveAccount(fromName);
  const recipient = resolveAccount(toName);
  if (!sender || !recipient) {
    console.error('Unknown account. Use: alice, bob, charlie or a 0x address');
    return 1;
  }

  const amountWei = BigInt(Math.floor(parseFloat(amountEth) * 1e18));

  logClientBanner(sender.name, sender.address, 'Chain A (depositor)');
  logGethInfo('client', `Preparing lock transfer to ${recipient.name} on Chain B…`);

  // Check balance before
  const balRes = await fetch(
    `${config.apiUrl}/api/balance?chain=a&address=${sender.address}`
  );
  const balBefore = (await balRes.json()) as { balance: string };
  console.log(`  Balance (Chain A): ${formatEth(BigInt(balBefore.balance))} ETH\n`);

  const res = await fetch(`${config.apiUrl}/api/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: sender.address,
      recipient: recipient.address,
      amount: amountWei.toString(),
    }),
  });

  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    console.error(`\n  ✗ Lock failed: ${err.error ?? res.statusText}`);
    return 1;
  }

  const lock = (await res.json()) as {
    messageId: string;
    txHash: string;
    blockNumber: number;
    blockHash: string;
    receipt: TxReceipt;
    amount: string;
  };

  console.log(`\n  ${sender.name} submitted lock on Chain A`);
  logTxReceipt(lock.receipt);

  if (verbose) {
    logGethInfo('client', 'Waiting for relayer to mint on Chain B…');
  }

  const msg = await waitForMint(config, lock.messageId, 15000);
  if (!msg) {
    console.error('\n  ✗ Timeout waiting for bridge mint');
    return 1;
  }

  if (msg.status === 'minted') {
    console.log(`\n  ✓ Bridge complete — funds minted to ${recipient.name} on Chain B`);
    if (verbose && msg.chainBReceipt) logTxReceipt(msg.chainBReceipt);
    logGethInfo('client', `messageId=${lock.messageId}`);
    logGethInfo('client', `View full details: nexeth bridge tx ${lock.messageId}`);
    return 0;
  }

  console.error(`\n  ✗ Bridge failed: ${msg.error ?? msg.status}`);
  return 1;
}

/** Person B — watches Chain B for incoming mints (Geth-style tail) */
export async function runClientWatch(config: NexethConfig, args: string[]): Promise<number> {
  const who = getArg(args, '--as') ?? getArg(args, '--address') ?? 'bob';
  const acct = resolveAccount(who);
  if (!acct) {
    console.error('Unknown account. Use: alice, bob, charlie');
    return 1;
  }

  logClientBanner(acct.name, acct.address, 'Chain B (recipient watcher)');
  logGethInfo('client', 'Connecting to bridgenet WebSocket feed…');
  logGethInfo('client', 'Watching for incoming bridge mints. Press Ctrl+C to stop.\n');

  const balRes = await fetch(
    `${config.apiUrl}/api/balance?chain=b&address=${acct.address}`
  );
  let lastBalance = BigInt(((await balRes.json()) as { balance: string }).balance);
  console.log(`  Initial balance (Chain B): ${formatEth(lastBalance)} ETH\n`);

  const proto = config.apiUrl.startsWith('https') ? 'wss' : 'ws';
  const wsUrl = config.apiUrl.replace(/^https?/, proto) + '/ws';

  return new Promise((resolve) => {
    const WebSocket = require('ws');
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      logGethInfo('client', 'WebSocket connected — synced with bridgenet');
    });

    ws.on('message', async (raw: Buffer) => {
      const { event, data } = JSON.parse(raw.toString());

      if (event === 'message:updated' && data.recipientOnB?.toLowerCase() === acct.address.toLowerCase()) {
        if (data.status === 'minted') {
          console.log(`\n${'='.repeat(56)}`);
          console.log(`  INCOMING BRIDGE TRANSFER — ${acct.name}`);
          console.log(`${'='.repeat(56)}`);
          console.log(`  messageId:  ${data.messageId}`);
          console.log(`  from (A):   ${data.sender}`);
          console.log(`  amount:     ${formatEth(BigInt(data.amount))} ETH`);
          console.log(`  chainA tx:  ${data.chainATxHash}`);
          console.log(`  chainB tx:  ${data.chainBTxHash}`);

          if (data.chainBReceipt) logTxReceipt(data.chainBReceipt);

          const newBalRes = await fetch(
            `${config.apiUrl}/api/balance?chain=b&address=${acct.address}`
          );
          const newBalance = BigInt(((await newBalRes.json()) as { balance: string }).balance);
          logBalanceChange(acct.name, acct.address, 'Chain B', lastBalance, newBalance);
          lastBalance = newBalance;
          console.log();
        }
      }

      if (event === 'chain:heartbeat') {
        process.stdout.write(
          `\r${'\x1b[2m'}[sync] Chain B block ${data.chainB?.blockHeight ?? '?'}  ` +
            `balance ${formatEth(lastBalance)} ETH${'\x1b[0m'}  `
        );
      }
    });

    ws.on('close', () => {
      console.log('\n  WebSocket disconnected.');
      resolve(1);
    });

    ws.on('error', (err: Error) => {
      console.error(`\n  ✗ WebSocket error: ${err.message}`);
      console.error('  Hint: run `npm run bridgenet` first.');
      resolve(1);
    });

    process.on('SIGINT', () => {
      console.log('\n\n  Stopping watcher.');
      ws.close();
      resolve(0);
    });
  });
}

/** Show balance on either chain */
export async function runClientBalance(config: NexethConfig, args: string[]): Promise<number> {
  const who = getArg(args, '--as') ?? 'bob';
  const chain = getArg(args, '--chain') ?? 'b';
  const acct = resolveAccount(who);
  if (!acct) {
    console.error('Unknown account');
    return 1;
  }

  const res = await fetch(`${config.apiUrl}/api/balance?chain=${chain}&address=${acct.address}`);
  const data = (await res.json()) as { balance: string; chain: string };
  console.log(`\n  ${acct.name} (${acct.address})`);
  console.log(`  Chain ${data.chain.toUpperCase()}: ${formatEth(BigInt(data.balance))} ETH\n`);
  return 0;
}

export function runClientAccounts(): number {
  console.log('\n  Labeled test accounts\n');
  for (const acct of Object.values(ACCOUNTS)) {
    if (acct.role === 'relayer') continue;
    console.log(`  ${acct.name.padEnd(8)} ${acct.address}  (${acct.role})`);
  }
  console.log();
  return 0;
}

export async function runBridgeTx(config: NexethConfig, messageId: string): Promise<number> {
  const res = await fetch(`${config.apiUrl}/api/messages/${messageId}`);
  if (!res.ok) {
    console.error('Message not found');
    return 1;
  }
  const msg = (await res.json()) as {
    messageId: string;
    sender: string;
    recipientOnB: string;
    amount: string;
    status: string;
    chainATxHash: string;
    chainBTxHash?: string;
    chainABlock?: { number: number; hash: string };
    chainBBlock?: { number: number; hash: string };
    chainAReceipt?: TxReceipt;
    chainBReceipt?: TxReceipt;
    createdAt: number;
    updatedAt: number;
    error?: string;
    timeline: { status: string; at: number; detail?: string }[];
  };

  logBridgeMessage({
    ...msg,
    amount: BigInt(msg.amount),
    status: msg.status as BridgeMessage['status'],
    timeline: msg.timeline.map((t) => ({
      ...t,
      status: t.status as TimelineEvent['status'],
    })),
  } as BridgeMessage);
  return 0;
}

async function waitForMint(
  config: NexethConfig,
  messageId: string,
  timeoutMs: number
): Promise<{
  status: string;
  chainBTxHash?: string;
  chainBReceipt?: TxReceipt;
  error?: string;
} | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${config.apiUrl}/api/messages/${messageId}`);
    if (res.ok) {
      const msg = (await res.json()) as {
        status: string;
        chainBTxHash?: string;
        chainBReceipt?: TxReceipt;
        error?: string;
      };
      if (msg.status === 'minted' || msg.status === 'failed') return msg;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}
