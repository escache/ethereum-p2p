import type { BlockHeader, TxReceipt } from './tx-types';

export type BridgeMessageStatus = 'pending' | 'relaying' | 'minted' | 'failed';

export type SecurityModel = 'trusted-relayer' | 'multisig' | 'optimistic' | 'light-client';

export interface BridgeMessage {
  messageId: string;
  sender: string;
  recipientOnB: string;
  amount: bigint;
  status: BridgeMessageStatus;
  chainATxHash: string;
  chainBTxHash?: string;
  chainABlock?: BlockHeader;
  chainBBlock?: BlockHeader;
  chainAReceipt?: TxReceipt;
  chainBReceipt?: TxReceipt;
  createdAt: number;
  updatedAt: number;
  error?: string;
  timeline: TimelineEvent[];
}

export interface TimelineEvent {
  status: BridgeMessageStatus | 'locked';
  at: number;
  detail?: string;
}

export interface LockedEvent {
  messageId: string;
  sender: string;
  recipientOnB: string;
  amount: bigint;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockHash: string;
  receipt: TxReceipt;
}

export interface MintedEvent {
  messageId: string;
  recipient: string;
  amount: bigint;
  txHash: string;
  blockNumber: number;
  blockHash: string;
  receipt: TxReceipt;
}

export interface MintResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  blockHash?: string;
  receipt?: TxReceipt;
  error?: string;
}

export interface ChainHealth {
  name: string;
  chainId: number;
  blockHeight: number;
  healthy: boolean;
  type: 'simulated' | 'anvil' | 'sepolia' | 'app-chain';
}

export interface BridgenetHealth {
  api: boolean;
  relayer: boolean;
  chains: ChainHealth[];
  securityModel: SecurityModel;
  messageCount: number;
}
