// Block Storage Implementation
import { EventEmitter } from 'events';
import { BlockData, BlockStorage as IBlockStorage } from '../network/types';
import { createHash } from 'crypto';
import { writeFile, readFile } from 'fs/promises';
import { dirname } from 'path';

export class BlockStorage extends EventEmitter implements IBlockStorage {
    private storageBasePath: string;
    private blockCache: Map<string, BlockData>;
    private blockIndex: Map<number, string[]>;
    private maxCacheSize: number;

    constructor(config: BlockStorageConfig) {
        super();
        this.storageBasePath = config.storagePath;
        this.blockCache = new Map();
        this.blockIndex = new Map();
        this.maxCacheSize = config.maxCacheSize || 1000;
        this.initializeStorage();
    }

    private async initializeStorage(): Promise<void> {
        try {
            await this.loadBlockIndex();
        } catch (error) {
            this.emit('storage:error', {
                operation: 'initialize',
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    public async storeBlock(block: BlockData): Promise<void> {
        const blockHash = block.hash;
        
        try {
            this.blockCache.set(blockHash, block);
            this.updateBlockIndex(block);
            await this.persistBlock(block);
            await this.manageCacheSize();
            
            this.emit('block:stored', blockHash);
        } catch (error) {
            this.emit('storage:error', {
                operation: 'store',
                blockHash,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    public async getBlock(blockHash: string): Promise<BlockData | null> {
        try {
            if (this.blockCache.has(blockHash)) {
                return this.blockCache.get(blockHash)!;
            }

            const block = await this.loadBlockFromDisk(blockHash);
            if (block) {
                this.blockCache.set(blockHash, block);
            }
            return block;
        } catch (error) {
            this.emit('storage:error', {
                operation: 'get',
                blockHash,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    private updateBlockIndex(block: BlockData): void {
        const blockNumber = block.header.number;
        const blockHashes = this.blockIndex.get(blockNumber) || [];
        
        if (!blockHashes.includes(block.hash)) {
            blockHashes.push(block.hash);
            this.blockIndex.set(blockNumber, blockHashes);
        }
    }

    private async persistBlock(block: BlockData): Promise<void> {
        const blockPath = this.getBlockPath(block.hash);
        const blockData = JSON.stringify(block);
        await writeFile(blockPath, blockData, 'utf8');
    }

    private async loadBlockFromDisk(blockHash: string): Promise<BlockData | null> {
        try {
            const blockPath = this.getBlockPath(blockHash);
            const blockData = await readFile(blockPath, 'utf8');
            return JSON.parse(blockData);
        } catch {
            return null;
        }
    }

    private async manageCacheSize(): Promise<void> {
        if (this.blockCache.size <= this.maxCacheSize) {
            return;
        }

        const entriesToRemove = this.blockCache.size - this.maxCacheSize;
        const entries = Array.from(this.blockCache.entries());
        
        for (let i = 0; i < entriesToRemove; i++) {
            const [hash] = entries[i];
            this.blockCache.delete(hash);
        }
    }

    private getBlockPath(blockHash: string): string {
        const prefix = blockHash.slice(0, 4);
        return `${this.storageBasePath}/${prefix}/${blockHash}.json`;
    }

    private async loadBlockIndex(): Promise<void> {
        try {
            const indexPath = `${this.storageBasePath}/block_index.json`;
            const indexData = await readFile(indexPath, 'utf8');
            const parsed = JSON.parse(indexData);
            
            this.blockIndex = new Map(Object.entries(parsed).map(([key, value]) => [
                parseInt(key),
                value as string[]
            ]));
        } catch {
            this.blockIndex = new Map();
        }
    }
}

interface BlockStorageConfig {
    storagePath: string;
    maxCacheSize?: number;
} 