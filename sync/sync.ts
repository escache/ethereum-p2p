// Block Synchronization Implementation
import { EventEmitter } from 'events';
import { StateManager } from '../state/state';
import { ConsensusManager } from '../chain/consensus_manager';
import { BlockData } from '../network/types';

export class SyncManager extends EventEmitter {
    private stateManager: StateManager;
    private consensusManager: ConsensusManager;
    private syncState: SyncState;
    private blockQueue: BlockQueue;

    constructor(stateManager: StateManager, consensusManager: ConsensusManager) {
        super();
        this.stateManager = stateManager;
        this.consensusManager = consensusManager;
        this.syncState = {
            isSyncing: false,
            startBlock: 0,
            currentBlock: 0,
            targetBlock: 0,
            failedAttempts: 0
        };
        this.blockQueue = {
            pending: new Map(),
            processing: new Map(),
            validated: new Map()
        };
        this.setupSyncHandlers();
    }

    async startSync(): Promise<void> {
        if (this.syncState.isSyncing) {
            return;
        }

        this.syncState.isSyncing = true;
        this.emit('sync:started');

        try {
            await this.performBlockSync();
        } catch (error) {
            this.emit('sync:error', error);
            this.syncState.isSyncing = false;
        }
    }

    private async performBlockSync(): Promise<void> {
        const targetBlock = await this.getHighestPeerBlock();
        while (this.syncState.currentBlock < targetBlock) {
            const nextBatch = await this.requestBlockBatch(
                this.syncState.currentBlock + 1,
                Math.min(this.syncState.currentBlock + 128, targetBlock)
            );
            await this.processBlockBatch(nextBatch);
        }
    }

    private setupSyncHandlers(): void {
        this.emit('sync:handlers:ready');
    }

    private async setupInitialState(): Promise<void> {
        const latest = await this.stateManager.getLatestBlock().catch(() => null);
        this.syncState.currentBlock = latest?.header.number ?? 0;
    }

    private async getHighestPeerBlock(): Promise<number> {
        const networkState = await this.stateManager.getNetworkState();
        return networkState.lastBlockNumber || this.syncState.currentBlock;
    }

    private async requestBlockBatch(start: number, end: number): Promise<BlockData[]> {
        const request: BlockRequest = {
            blockNumber: start,
            attempts: 0,
            lastAttempt: Date.now(),
            timeout: setTimeout(() => this.handleRequestTimeout(start), 30000)
        };

        this.blockQueue.pending.set(start, request);

        try {
            const blocks = await this.fetchBlockRange(start, end);
            clearTimeout(request.timeout);
            return blocks;
        } catch (error) {
            this.handleSyncError(error, start);
            throw error;
        }
    }

    private async fetchBlockRange(start: number, end: number): Promise<BlockData[]> {
        const blocks: BlockData[] = [];
        for (let height = start; height <= end; height++) {
            const block = await this.stateManager.getBlockAtHeight(height);
            if (block) {
                blocks.push(block);
            }
        }
        return blocks;
    }

    private handleRequestTimeout(blockNumber: number): void {
        this.emit('sync:timeout', blockNumber);
    }

    private handleSyncError(error: unknown, blockNumber: number): void {
        this.emit('sync:block:error', { blockNumber, error });
    }

    private async processBlockBatch(blocks: BlockData[]): Promise<void> {
        for (const block of blocks) {
            this.blockQueue.processing.set(block.header.number, block);
            const result = await this.consensusManager.validateBlock(block);
            if (result.isValid) {
                this.blockQueue.validated.set(block.header.number, block);
                this.syncState.currentBlock = block.header.number;
                this.emit('block:synced', block.header.number);
            }
        }
    }
}

interface SyncState {
    isSyncing: boolean;
    startBlock: number;
    currentBlock: number;
    targetBlock: number;
    failedAttempts: number;
}

interface BlockQueue {
    pending: Map<number, BlockRequest>;
    processing: Map<number, BlockData>;
    validated: Map<number, BlockData>;
}

interface BlockRequest {
    blockNumber: number;
    attempts: number;
    lastAttempt: number;
    timeout: NodeJS.Timeout;
}
