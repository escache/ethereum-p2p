import { EventEmitter } from 'events';
import { createHash, randomBytes } from 'crypto';
import { buildTrustedProof } from '../shared/message-id';
import type { MintedEvent, MintResult } from '../shared/types';
import type { BlockHeader, TxReceipt } from '../shared/tx-types';

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
  accounts: [],
};

/**
 * Minimal Chain B app-chain — ledger + MintBridge semantics.
 * Accepts bridge mints from authorized relayer only.
 */
export class AppChainB extends EventEmitter {
  readonly relayerId: string;
  private chainId: number;
  private blockHeight = 0;
  private txCount = 0;
  private balances = new Map<string, bigint>();
  private minted = new Set<string>();
  private totalMinted = 0n;
  private blocks = new Map<number, BlockHeader>();
  private receipts = new Map<string, TxReceipt>();
  private lastBlockHash = '0x' + '00'.repeat(32);

  constructor(relayerId: string, genesis: GenesisConfig = DEFAULT_GENESIS) {
    super();
    this.relayerId = relayerId;
    this.chainId = genesis.chainId;
    for (const acct of genesis.accounts) {
      this.balances.set(acct.address.toLowerCase(), acct.balance);
    }
    this.blockHeight = 1;
    const genesisHash = '0x' + createHash('sha256').update('genesis').digest('hex');
    this.blocks.set(1, {
      number: 1,
      hash: genesisHash,
      parentHash: '0x' + '00'.repeat(32),
      timestamp: Date.now(),
      chainId: this.chainId,
      transactionCount: 0,
    });
    this.lastBlockHash = genesisHash;
    this.emit('block', this.blocks.get(1));
  }

  getHealth() {
    return {
      name: 'Chain B (Nexeth App-Chain)',
      chainId: this.chainId,
      blockHeight: this.blockHeight,
      healthy: true,
      type: 'app-chain' as const,
      totalMinted: this.totalMinted.toString(),
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
    this.txCount++;
    const txHash = '0x' + randomBytes(32).toString('hex');
    const blockHash = '0x' + createHash('sha256').update(`b:${this.blockHeight}:${txHash}`).digest('hex');
    const now = Date.now();

    const key = recipient.toLowerCase();
    this.balances.set(key, (this.balances.get(key) ?? 0n) + amount);
    this.totalMinted += amount;

    const mintBridge = '0xMintBridge00000000000000000000000000001';
    const receipt: TxReceipt = {
      transactionHash: txHash,
      blockHash,
      blockNumber: this.blockHeight,
      transactionIndex: 0,
      from: this.relayerId,
      to: mintBridge,
      value: amount.toString(),
      gasUsed: '45000',
      gasPrice: '1000000000',
      nonce: this.txCount - 1,
      status: 'success',
      chainId: this.chainId,
      timestamp: now,
      type: 'mint',
      contractAddress: mintBridge,
      logs: [
        {
          address: mintBridge,
          topics: ['0xMinted', messageId, recipient],
          data: `amount=${amount}`,
          logIndex: 0,
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

    const event: MintedEvent = {
      messageId,
      recipient,
      amount,
      txHash,
      blockNumber: this.blockHeight,
      blockHash,
      receipt,
    };

    this.emit('Minted', event);
    this.emit('block', block);

    return { success: true, txHash, blockNumber: this.blockHeight, blockHash, receipt };
  }

  faucet(address: string, amount: bigint): void {
    const key = address.toLowerCase();
    this.balances.set(key, (this.balances.get(key) ?? 0n) + amount);
  }
}
