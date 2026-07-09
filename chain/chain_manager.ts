// Chain Management Implementation
import { EventEmitter } from 'events';
import { StateManager } from '../state/state';
import { BlockValidator } from '../verification/block_validator';
import {
    BlockData,
    ChainManager as IChainManager,
    ChainState,
    ForkData,
    ForkDetectionResult
} from '../network/types';

class ForkDetector {
    private chainManager: ChainManager;

    constructor(chainManager: ChainManager) {
        this.chainManager = chainManager;
    }

    async detectFork(block: BlockData): Promise<ForkData> {
        const parentHash = block.header.parentHash;
        const parentBlock = await this.chainManager.getBlock(parentHash);

        if (!parentBlock) {
            return {
                startBlock: block,
                blocks: [block],
                totalDifficulty: block.header.difficulty,
                isFork: true
            };
        }

        // Check if this creates a fork
        const canonicalBlock = await this.chainManager.getBlockAtHeight(block.header.number);
        if (canonicalBlock && canonicalBlock.hash !== block.hash) {
            return {
                startBlock: parentBlock,
                blocks: [block],
                totalDifficulty: block.header.difficulty,
                isFork: true
            };
        }

        return {
            startBlock: block,
            blocks: [],
            totalDifficulty: 0n,
            isFork: false
        };
    }
}

export class ChainManager extends EventEmitter implements IChainManager {
    private stateManager: StateManager;
    private blockValidator: BlockValidator;
    private chainState: ChainState;
    private forkDetector: ForkDetector;

    constructor(stateManager: StateManager, blockValidator: BlockValidator) {
        super();
        this.stateManager = stateManager;
        this.blockValidator = blockValidator;
        this.initializeChainState();
        this.forkDetector = new ForkDetector(this);
    }

    private async initializeChainState(): Promise<void> {
        const genesisBlock = await this.stateManager.getGenesisBlock();
        this.chainState = {
            lastBlock: genesisBlock,
            height: 0,
            totalDifficulty: 0n,
            forks: []
        };
    }

    // Required interface methods
    public async processNewBlock(block: BlockData): Promise<void> {
        const validationResult = await this.blockValidator.validateBlock(block);
        if (!validationResult.isValid) {
            this.emit('block:invalid', block.hash, validationResult.error);
            return;
        }

        try {
            await this.updateChainState(block);
            await this.handlePotentialFork(block);
            this.emit('block:processed', block.hash);
        } catch (error) {
            this.emit('chain:error', error);
        }
    }

    public async handlePotentialFork(block: BlockData): Promise<void> {
        const forkData = await this.forkDetector.detectFork(block);
        if (forkData.isFork) {
            await this.resolveFork(forkData);
            this.emit('fork:resolved', forkData);
        }
    }

    // Helper methods
    private async updateChainState(block: BlockData): Promise<void> {
        const newTotalDifficulty = this.chainState.totalDifficulty + block.header.difficulty;
        
        // Update chain state
        this.chainState = {
            lastBlock: block,
            height: block.header.number,
            totalDifficulty: newTotalDifficulty,
            forks: this.chainState.forks
        };

        // Persist state
        await this.stateManager.updateChainState(block);
    }

    private async resolveFork(forkData: ForkData): Promise<void> {
        // Implement fork resolution logic
        // This would typically involve:
        // 1. Calculating total difficulty of both chains
        // 2. Choosing the chain with higher difficulty
        // 3. Reorganizing the chain if necessary
    }

    // Public methods needed by ForkDetector
    public async getBlock(hash: string): Promise<BlockData | null> {
        return this.stateManager.getBlock(hash);
    }

    public async getBlockAtHeight(height: number): Promise<BlockData | null> {
        return this.stateManager.getBlockAtHeight(height);
    }
} 