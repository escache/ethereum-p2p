import { EventEmitter } from 'events';
import { buildTrustedProof } from '../shared/message-id';
import type { BridgeMessage, LockedEvent, SecurityModel } from '../shared/types';
import type { SimulatedChainA } from '../chain-a/simulated-chain';
import type { AppChainB } from '../chain-b/app-chain';
import { logGethInfo, logTxReceipt } from '../shared/verbose';

export interface RelayerConfig {
  confirmations: number;
  pollIntervalMs: number;
  securityModel: SecurityModel;
  verbose: boolean;
}

const DEFAULT_CONFIG: RelayerConfig = {
  confirmations: 1,
  pollIntervalMs: 500,
  securityModel: 'trusted-relayer',
  verbose: process.env.VERBOSE === '1' || process.env.VERBOSE === 'true',
};

/**
 * Watches Chain A Locked events and submits mints to Chain B.
 * Idempotent on messageId — never mints twice.
 */
export class BridgeRelayer extends EventEmitter {
  private chainA: SimulatedChainA;
  private chainB: AppChainB;
  private config: RelayerConfig;
  private messages = new Map<string, BridgeMessage>();
  private running = false;
  private pendingQueue: LockedEvent[] = [];

  constructor(
    chainA: SimulatedChainA,
    chainB: AppChainB,
    config: Partial<RelayerConfig> = {}
  ) {
    super();
    this.chainA = chainA;
    this.chainB = chainB;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.chainA.on('Locked', (event: LockedEvent) => {
      this.handleLocked(event);
    });
  }

  start(): void {
    this.running = true;
    this.vlog('relayer', 'Started — watching Chain A for Locked events');
    this.emit('started');
  }

  stop(): void {
    this.running = false;
    this.emit('stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getMessages(): BridgeMessage[] {
    return Array.from(this.messages.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getMessage(messageId: string): BridgeMessage | undefined {
    return this.messages.get(messageId);
  }

  private handleLocked(event: LockedEvent): void {
    const now = Date.now();
    const existing = this.messages.get(event.messageId);

    if (existing) {
      this.emit('duplicate', event.messageId);
      return;
    }

    const message: BridgeMessage = {
      messageId: event.messageId,
      sender: event.sender,
      recipientOnB: event.recipientOnB,
      amount: event.amount,
      status: 'pending',
      chainATxHash: event.txHash,
      chainABlock: this.chainA.getBlock(event.blockNumber),
      chainAReceipt: event.receipt,
      createdAt: now,
      updatedAt: now,
      timeline: [
        {
          status: 'locked',
          at: now,
          detail: `Chain A block #${event.blockNumber} tx=${event.txHash}`,
        },
      ],
    };

    this.messages.set(event.messageId, message);
    this.emit('message:created', message);

    console.log(`[relayer] LOCKED  messageId=${event.messageId}`);
    console.log(`          from=${event.sender} to=${event.recipientOnB} amount=${event.amount} wei`);
    console.log(`          chainA tx=${event.txHash} block=#${event.blockNumber}`);
    if (this.config.verbose) logTxReceipt(event.receipt);

    this.pendingQueue.push(event);
    void this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (!this.running) return;

    while (this.pendingQueue.length > 0) {
      const event = this.pendingQueue.shift()!;
      await this.relay(event);
    }
  }

  private async relay(event: LockedEvent): Promise<void> {
    const message = this.messages.get(event.messageId);
    if (!message) return;

    if (this.config.confirmations > 0) {
      this.vlog('relayer', `Waiting ${this.config.confirmations} confirmation(s) on Chain A…`);
      await sleep(this.config.pollIntervalMs * this.config.confirmations);
    }

    this.updateMessage(event.messageId, 'relaying', 'Building proof and submitting mint to Chain B');
    console.log(`[relayer] RELAYING messageId=${event.messageId}`);

    const proof = buildTrustedProof(event.messageId, this.chainB.relayerId);
    const result = this.chainB.mint(
      event.messageId,
      event.recipientOnB,
      event.amount,
      proof,
      this.chainB.relayerId
    );

    if (!result.success) {
      this.updateMessage(event.messageId, 'failed', result.error);
      console.log(`[relayer] FAILED  messageId=${event.messageId} error=${result.error}`);
      this.emit('message:updated', this.messages.get(event.messageId));
      return;
    }

    const updated = this.messages.get(event.messageId)!;
    updated.chainBTxHash = result.txHash;
    updated.chainBBlock = result.blockNumber ? this.chainB.getBlock(result.blockNumber) : undefined;
    updated.chainBReceipt = result.receipt;
    this.updateMessage(
      event.messageId,
      'minted',
      `Chain B block #${result.blockNumber} tx=${result.txHash}`
    );

    console.log(`[relayer] MINTED  messageId=${event.messageId}`);
    console.log(`          chainB tx=${result.txHash} block=#${result.blockNumber}`);
    if (this.config.verbose && result.receipt) logTxReceipt(result.receipt);

    this.emit('message:updated', this.messages.get(event.messageId));
  }

  private updateMessage(
    messageId: string,
    status: BridgeMessage['status'],
    detail?: string
  ): void {
    const message = this.messages.get(messageId);
    if (!message) return;

    message.status = status;
    message.updatedAt = Date.now();
    if (detail) message.error = status === 'failed' ? detail : undefined;
    message.timeline.push({ status, at: message.updatedAt, detail });
  }

  private vlog(tag: string, msg: string): void {
    if (this.config.verbose) logGethInfo(tag, msg);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
