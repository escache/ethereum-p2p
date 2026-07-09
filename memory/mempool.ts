// Mempool Management Implementation
import { EventEmitter } from 'events';
import { StateManager } from '../state/state';

export class MempoolManager extends EventEmitter {
    private stateManager: StateManager;
    private pendingTransactions: Map<string, MempoolTransaction>;
    private mempoolConfig: MempoolConfig;

    constructor(stateManager: StateManager, config: MempoolConfig) {
        super();
        this.stateManager = stateManager;
        this.pendingTransactions = new Map();
        this.mempoolConfig = config;
        this.initializeMempool();
    }

    private initializeMempool(): void {
        this.emit('mempool:initialized');
    }

    async addTransaction(tx: TransactionData): Promise<MempoolAddResult> {
        if (this.pendingTransactions.size >= this.mempoolConfig.maxSize) {
            await this.cleanMempool();
        }

        try {
            const mempoolTx = await this.validateAndPrepare(tx);
            await this.insertTransaction(mempoolTx);
            return { success: true, txHash: tx.hash };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    async getTransactions(criteria: MempoolQueryCriteria): Promise<TransactionData[]> {
        const transactions = Array.from(this.pendingTransactions.values());
        return this.filterTransactions(transactions, criteria);
    }

    private async cleanMempool(): Promise<void> {
        const now = Date.now();
        for (const [hash, entry] of this.pendingTransactions) {
            if (now - entry.addedAt > this.mempoolConfig.maxTransactionAge) {
                this.pendingTransactions.delete(hash);
            }
        }
    }

    private async validateAndPrepare(tx: TransactionData): Promise<MempoolTransaction> {
        return {
            transaction: tx,
            addedAt: Date.now(),
            gasPrice: tx.gasPrice,
            size: tx.data.length,
            score: Number(tx.gasPrice)
        };
    }

    private async insertTransaction(mempoolTx: MempoolTransaction): Promise<void> {
        this.pendingTransactions.set(mempoolTx.transaction.hash, mempoolTx);
    }

    private filterTransactions(
        transactions: MempoolTransaction[],
        criteria: MempoolQueryCriteria
    ): TransactionData[] {
        return transactions
            .map(entry => entry.transaction)
            .filter(tx => {
                if (criteria.minGasPrice && tx.gasPrice < criteria.minGasPrice) return false;
                if (criteria.maxGasLimit && tx.gasLimit > criteria.maxGasLimit) return false;
                if (criteria.fromAddress && tx.from !== criteria.fromAddress) return false;
                if (criteria.toAddress && tx.to !== criteria.toAddress) return false;
                return true;
            })
            .slice(0, criteria.limit ?? transactions.length);
    }
}

interface TransactionData {
    hash: string;
    nonce: number;
    from: string;
    to: string;
    value: bigint;
    gasPrice: bigint;
    gasLimit: bigint;
    data: Buffer;
}

interface MempoolTransaction {
    transaction: TransactionData;
    addedAt: number;
    gasPrice: bigint;
    size: number;
    score: number;
}

interface MempoolConfig {
    maxSize: number;
    maxTransactionAge: number;
    minGasPrice: bigint;
    maxGasLimit: bigint;
}

interface MempoolQueryCriteria {
    minGasPrice?: bigint;
    maxGasLimit?: bigint;
    fromAddress?: string;
    toAddress?: string;
    limit?: number;
}

interface MempoolAddResult {
    success: boolean;
    txHash?: string;
    error?: string;
}
