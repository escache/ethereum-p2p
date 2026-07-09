import { EventEmitter } from 'events';
import { createHash, randomBytes } from 'crypto';
import { computeMessageId } from '../shared/message-id';
import type { LockedEvent } from '../shared/types';
import type { BlockHeader, TxReceipt } from '../shared/tx-types';
import { ACCOUNTS } from '../shared/accounts';

export interface LockResult {
  txHash: string;
  messageId: string;
  blockNumber: number;
  blockHash: string;
  receipt: TxReceipt;
}

/**
 * Simulated Chain A — in-process lock chain matching LockBridge semantics.
 * Produces full transaction receipts like a real execution client.
 */
export class SimulatedChainA extends EventEmitter {
  readonly chainId = 31337;
  private blockHeight = 0;
  private txCount = 0;
  private totalLocked = 0n;
  private processed = new Set<string>();
  private balances = new Map<string, bigint>();
  private blocks = new Map<number, BlockHeader>();
  private receipts = new Map<string, TxReceipt>();
  private lastBlockHash = '0x' + '00'.repeat(32);

  constructor() {
    super();
    for (const acct of Object.values(ACCOUNTS)) {
      if (acct.role === 'depositor') {
        this.balances.set(acct.address.toLowerCase(), 100n * 10n ** 18n);
      }
    }
  }

  getHealth() {
    return {
      name: 'Chain A (Simulated)',
      chainId: this.chainId,
      blockHeight: this.blockHeight,
      healthy: true,
      type: 'simulated' as const,
      totalLocked: this.totalLocked.toString(),
      txCount: this.txCount,
    };
  }

  getBalance(address: string): bigint {
    return this.balances.get(address.toLowerCase()) ?? 0n;
  }

  getReceipt(txHash: string): TxReceipt | undefined {
    return this.receipts.get(txHash);
  }

  getBlock(number: number): BlockHeader | undefined {
    return this.blocks.get(number);
  }

  lock(sender: string, recipientOnB: string, amount: bigint): LockResult {
    if (amount <= 0n) throw new Error('amount required');
    if (!recipientOnB || recipientOnB === '0x0000000000000000000000000000000000000000') {
      throw new Error('invalid recipient');
    }

    const senderBal = this.getBalance(sender);
    if (senderBal < amount) throw new Error('insufficient balance');

    this.blockHeight++;
    this.txCount++;
    const txHash = '0x' + randomBytes(32).toString('hex');
    const blockHash = '0x' + createHash('sha256').update(`${this.blockHeight}:${txHash}`).digest('hex');
    const logIndex = 0;
    const messageId = computeMessageId(this.chainId, txHash, logIndex);
    const now = Date.now();

    if (this.processed.has(messageId)) throw new Error('duplicate messageId');
    this.processed.add(messageId);
    this.totalLocked += amount;
    this.balances.set(sender.toLowerCase(), senderBal - amount);

    const lockBridge = '0xLockBridge00000000000000000000000000001';
    const receipt: TxReceipt = {
      transactionHash: txHash,
      blockHash,
      blockNumber: this.blockHeight,
      transactionIndex: 0,
      from: sender,
      to: lockBridge,
      value: amount.toString(),
      gasUsed: '21000',
      gasPrice: '1000000000',
      nonce: this.txCount - 1,
      status: 'success',
      chainId: this.chainId,
      timestamp: now,
      type: 'lock',
      contractAddress: lockBridge,
      logs: [
        {
          address: lockBridge,
          topics: [
            '0xLocked',
            messageId,
            sender,
          ],
          data: `recipient=${recipientOnB}&amount=${amount}`,
          logIndex,
          blockNumber: this.blockHeight,
          transactionHash: txHash,
        },
      ],
    };

    const block: BlockHeader = {
      number: this.blockHeight,
      hash: blockHash,
      parentHash: this.lastBlockHash,
      timestamp: now,
      chainId: this.chainId,
      transactionCount: 1,
    };

    this.blocks.set(this.blockHeight, block);
    this.receipts.set(txHash, receipt);
    this.lastBlockHash = blockHash;

    const event: LockedEvent = {
      messageId,
      sender,
      recipientOnB,
      amount,
      txHash,
      logIndex,
      blockNumber: this.blockHeight,
      blockHash,
      receipt,
    };

    this.emit('Locked', event);
    this.emit('block', block);

    return { txHash, messageId, blockNumber: this.blockHeight, blockHash, receipt };
  }

  faucet(address: string, amount: bigint): void {
    const key = address.toLowerCase();
    this.balances.set(key, (this.balances.get(key) ?? 0n) + amount);
  }
}
