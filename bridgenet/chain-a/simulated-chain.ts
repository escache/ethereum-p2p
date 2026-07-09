import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';
import { computeMessageId } from '../shared/message-id';
import type { LockedEvent } from '../shared/types';

export interface LockResult {
  txHash: string;
  messageId: string;
  blockNumber: number;
}

/**
 * Simulated Chain A — in-process lock chain matching LockBridge semantics.
 * Anvil-compatible RPC surface planned for M2.
 */
export class SimulatedChainA extends EventEmitter {
  readonly chainId = 31337;
  private blockHeight = 0;
  private nonce = 0;
  private totalLocked = 0n;
  private processed = new Set<string>();
  private balances = new Map<string, bigint>();

  constructor() {
    super();
    // Faucet account for demos
    this.balances.set(
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      10000n * 10n ** 18n
    );
  }

  getHealth() {
    return {
      name: 'Chain A (Simulated)',
      chainId: this.chainId,
      blockHeight: this.blockHeight,
      healthy: true,
      type: 'simulated' as const,
      totalLocked: this.totalLocked.toString(),
    };
  }

  getBalance(address: string): bigint {
    return this.balances.get(address.toLowerCase()) ?? 0n;
  }

  lock(sender: string, recipientOnB: string, amount: bigint): LockResult {
    if (amount <= 0n) throw new Error('amount required');
    if (!recipientOnB || recipientOnB === '0x0000000000000000000000000000000000000000') {
      throw new Error('invalid recipient');
    }

    const senderBal = this.getBalance(sender);
    if (senderBal < amount) throw new Error('insufficient balance');

    this.blockHeight++;
    const txHash = '0x' + randomBytes(32).toString('hex');
    const logIndex = 0;
    const messageId = computeMessageId(this.chainId, txHash, logIndex);

    if (this.processed.has(messageId)) throw new Error('duplicate messageId');
    this.processed.add(messageId);
    this.nonce++;
    this.totalLocked += amount;

    this.balances.set(sender.toLowerCase(), senderBal - amount);

    const event: LockedEvent = {
      messageId,
      sender,
      recipientOnB,
      amount,
      txHash,
      logIndex,
      blockNumber: this.blockHeight,
    };

    this.emit('Locked', event);
    this.emit('block', this.blockHeight);

    return { txHash, messageId, blockNumber: this.blockHeight };
  }

  /** Demo helper — credit test account */
  faucet(address: string, amount: bigint): void {
    const key = address.toLowerCase();
    this.balances.set(key, (this.balances.get(key) ?? 0n) + amount);
  }
}
