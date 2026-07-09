import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';
import { buildTrustedProof } from '../shared/message-id';
import type { MintResult } from '../shared/types';

export interface GenesisAccount {
  address: string;
  balance: bigint;
}

export interface GenesisConfig {
  chainId: number;
  accounts: GenesisAccount[];
}

const DEFAULT_GENESIS: GenesisConfig = {
  chainId: 424242,
  accounts: [
  ],
};

/**
 * Minimal Chain B app-chain — ledger + MintBridge semantics.
 * Accepts bridge mints from authorized relayer only.
 */
export class AppChainB extends EventEmitter {
  readonly relayerId: string;
  private chainId: number;
  private blockHeight = 0;
  private balances = new Map<string, bigint>();
  private minted = new Set<string>();
  private totalMinted = 0n;

  constructor(relayerId: string, genesis: GenesisConfig = DEFAULT_GENESIS) {
    super();
    this.relayerId = relayerId;
    this.chainId = genesis.chainId;
    for (const acct of genesis.accounts) {
      this.balances.set(acct.address.toLowerCase(), acct.balance);
    }
    // Genesis block
    this.blockHeight = 1;
    this.emit('block', this.blockHeight);
  }

  getHealth() {
    return {
      name: 'Chain B (Nexeth App-Chain)',
      chainId: this.chainId,
      blockHeight: this.blockHeight,
      healthy: true,
      type: 'app-chain' as const,
      totalMinted: this.totalMinted.toString(),
    };
  }

  getBalance(address: string): bigint {
    return this.balances.get(address.toLowerCase()) ?? 0n;
  }

  loadGenesis(config: GenesisConfig): void {
    this.chainId = config.chainId;
    for (const acct of config.accounts) {
      this.balances.set(acct.address.toLowerCase(), acct.balance);
    }
    this.emit('genesis:loaded', config);
  }

  mint(
    messageId: string,
    recipient: string,
    amount: bigint,
    proof: string,
    submitter: string
  ): MintResult {
    if (submitter !== this.relayerId) {
      return { success: false, error: 'not relayer' };
    }

    const expectedProof = buildTrustedProof(messageId, this.relayerId);
    if (proof !== expectedProof) {
      return { success: false, error: 'invalid proof' };
    }

    if (this.minted.has(messageId)) {
      return { success: false, error: 'already minted' };
    }
    if (amount <= 0n) {
      return { success: false, error: 'amount required' };
    }
    if (!recipient || recipient === '0x0000000000000000000000000000000000000000') {
      return { success: false, error: 'invalid recipient' };
    }

    this.minted.add(messageId);
    this.blockHeight++;
    const txHash = '0x' + randomBytes(32).toString('hex');

    const key = recipient.toLowerCase();
    this.balances.set(key, (this.balances.get(key) ?? 0n) + amount);
    this.totalMinted += amount;

    this.emit('Minted', { messageId, recipient, amount, txHash, blockNumber: this.blockHeight });
    this.emit('block', this.blockHeight);

    return { success: true, txHash };
  }

  faucet(address: string, amount: bigint): void {
    const key = address.toLowerCase();
    this.balances.set(key, (this.balances.get(key) ?? 0n) + amount);
  }
}
