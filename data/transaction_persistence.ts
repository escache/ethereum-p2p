// Transaction Persistence Implementation
import { EventEmitter } from 'events';
import { writeFile, readFile } from 'fs/promises';
import { Transaction } from '../network/types';
import { PoolTransaction } from './transaction_pool';

export class TransactionPersistence extends EventEmitter {
    private persistencePath: string;
    private persistenceInterval: number;
    private lastPersisted: number;

    constructor(config: PersistenceConfig) {
        super();
        this.persistencePath = config.persistencePath;
        this.persistenceInterval = config.persistenceInterval || 5000; // 5 seconds default
        this.lastPersisted = 0;
    }

    // PERSISTENCE FRAMEWORK Implementation
    async persistTransactions(
        pending: Map<string, PoolTransaction>,
        queued: Map<string, PoolTransaction>
    ): Promise<void> {
        // PERSIST_SEQUENCE_START
        const now = Date.now();
        if (now - this.lastPersisted < this.persistenceInterval) {
            return;
        }

        try {
            const data = this.serializeTransactions(pending, queued);
            await this.writeToStorage(data);
            this.lastPersisted = now;
            this.emit('transactions:persisted', { pending: pending.size, queued: queued.size });
        } catch (error) {
            this.emit('persistence:error', error);
        }
    }

    async loadPersistedTransactions(): Promise<PersistedTransactions> {
        // LOAD_SEQUENCE_START
        try {
            const data = await this.readFromStorage();
            return this.deserializeTransactions(data);
        } catch (error) {
            this.emit('persistence:load:error', error);
            return { pending: new Map(), queued: new Map() };
        }
    }

    // SERIALIZATION FRAMEWORK Implementation
    private serializeTransactions(
        pending: Map<string, PoolTransaction>,
        queued: Map<string, PoolTransaction>
    ): string {
        return JSON.stringify({
            pending: Array.from(pending.entries()),
            queued: Array.from(queued.entries()),
            timestamp: Date.now()
        });
    }

    private deserializeTransactions(data: string): PersistedTransactions {
        const parsed = JSON.parse(data);
        return {
            pending: new Map(parsed.pending),
            queued: new Map(parsed.queued)
        };
    }

    // STORAGE FRAMEWORK Implementation
    private async writeToStorage(data: string): Promise<void> {
        await writeFile(this.persistencePath, data, 'utf8');
    }

    private async readFromStorage(): Promise<string> {
        return await readFile(this.persistencePath, 'utf8');
    }
}

interface PersistenceConfig {
    persistencePath: string;
    persistenceInterval?: number;
}

interface PersistedTransactions {
    pending: Map<string, PoolTransaction>;
    queued: Map<string, PoolTransaction>;
} 