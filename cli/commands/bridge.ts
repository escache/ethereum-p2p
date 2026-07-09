import type { NexethConfig } from '../config/schema';

export async function runBridgeDemo(config: NexethConfig, json: boolean): Promise<number> {
  try {
    const res = await fetch(`${config.apiUrl}/api/demo/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        recipient: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        amount: '1000000000000000000',
      }),
    });

    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }

    const lock = (await res.json()) as {
      messageId: string;
      txHash: string;
    };

    if (json) {
      const msg = await waitForMint(config, lock.messageId);
      console.log(JSON.stringify({ lock, message: msg }, null, 2));
      return msg?.status === 'minted' ? 0 : 1;
    }

    console.log('\n  nexeth bridge demo\n');
    console.log(`  LOCKED   messageId=${lock.messageId.slice(0, 22)}…`);
    console.log(`           tx=${lock.txHash.slice(0, 22)}…`);
    console.log('  RELAYING …');

    const msg = await waitForMint(config, lock.messageId);

    if (msg?.status === 'minted') {
      console.log(`  MINTED   tx=${msg.chainBTxHash?.slice(0, 22)}…`);
      console.log(`\n  ✓ Bridge demo complete. Portal: ${config.portalUrl}\n`);
      return 0;
    }

    console.error(`\n  ✗ Bridge failed: ${msg?.error ?? msg?.status ?? 'timeout'}\n`);
    return 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      console.log(JSON.stringify({ error: message }));
    } else {
      console.error(`\n  ✗ ${message}`);
      console.error('  Hint: run `npm run bridgenet` first.\n');
    }
    return 1;
  }
}

export async function runBridgeMessages(config: NexethConfig, json: boolean): Promise<number> {
  try {
    const res = await fetch(`${config.apiUrl}/api/messages`);
    const messages = (await res.json()) as Array<{
      status: string;
      messageId: string;
      amount: string;
      recipientOnB: string;
    }>;

    if (json) {
      console.log(JSON.stringify(messages, null, 2));
      return 0;
    }

    console.log('\n  Bridge messages\n');
    if (messages.length === 0) {
      console.log('  (none — run `nexeth bridge demo`)\n');
      return 0;
    }

    for (const m of messages) {
      const amt = (BigInt(m.amount) / 10n ** 18n).toString();
      console.log(
        `  ${m.status.padEnd(8)} ${m.messageId.slice(0, 18)}…  ${amt} ETH  → ${m.recipientOnB.slice(0, 10)}…`
      );
    }
    console.log();
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

async function waitForMint(
  config: NexethConfig,
  messageId: string,
  timeoutMs = 10000
): Promise<{ status: string; chainBTxHash?: string; error?: string } | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${config.apiUrl}/api/messages/${messageId}`);
    if (res.ok) {
      const msg = (await res.json()) as {
        status: string;
        chainBTxHash?: string;
        error?: string;
      };
      if (msg.status === 'minted' || msg.status === 'failed') return msg;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}
