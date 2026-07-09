import { EventEmitter } from 'events';
import { buildTrustedProof } from '../shared/message-id';
import type { BridgeMessage, LockedEvent, SecurityModel } from '../shared/types';
import type { SimulatedChainA } from '../chain-a/simulated-chain';
import type { AppChainB } from '../chain-b/app-chain';

export interface RelayerConfig {
  confirmations: number;
  pollIntervalMs: number;
  securityModel: SecurityModel;
}

const DEFAULT_CONFIG: RelayerConfig = {
  confirmations: 1,
  pollIntervalMs: 500,
  securityModel: 'trusted-relayer',
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
      createdAt: now,
      updatedAt: now,
      timeline: [{ status: 'locked', at: now, detail: `Block ${event.blockNumber}` }],
    };

    this.messages.set(event.messageId, message);
    this.emit('message:created', message);
    console.log(`[relayer] LOCKED  messageId=${event.messageId.slice(0, 18)}… amount=${event.amount}`);

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

    // Wait confirmations (simulated delay)
    if (this.config.confirmations > 0) {
      await sleep(this.config.pollIntervalMs * this.config.confirmations);
    }

    this.updateMessage(event.messageId, 'relaying', 'Submitting mint to Chain B');
    console.log(`[relayer] RELAYING messageId=${event.messageId.slice(0, 18)}…`);

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
      console.log(`[relayer] FAILED  messageId=${event.messageId.slice(0, 18)}… error=${result.error}`);
      this.emit('message:updated', this.messages.get(event.messageId));
      return;
    }

    const updated = this.messages.get(event.messageId)!;
    updated.chainBTxHash = result.txHash;
    this.updateMessage(event.messageId, 'minted', `Minted on block ${this.chainB.getHealth().blockHeight}`);
    console.log(`[relayer] MINTED  messageId=${event.messageId.slice(0, 18)}… tx=${result.txHash?.slice(0, 18)}…`);
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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
