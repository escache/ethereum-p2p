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
}

export interface MintResult {
  success: boolean;
  txHash?: string;
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
