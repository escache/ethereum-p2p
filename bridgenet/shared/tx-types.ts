export interface TxLog {
  address: string;
  topics: string[];
  data: string;
  logIndex: number;
  blockNumber: number;
  transactionHash: string;
}

export interface TxReceipt {
  transactionHash: string;
  blockHash: string;
  blockNumber: number;
  transactionIndex: number;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  nonce: number;
  status: 'success' | 'reverted';
  chainId: number;
  timestamp: number;
  logs: TxLog[];
  contractAddress?: string;
  type: 'lock' | 'mint' | 'burn' | 'transfer';
}

export interface BlockHeader {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  chainId: number;
  transactionCount: number;
}
