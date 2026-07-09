import { StateDB } from '../network/types';

export interface EVMExecutionParams {
    code: Buffer;
    data: Buffer;
    value: bigint;
    sender: string;
    gasLimit: bigint;
}

export interface EVMExecutionResult {
    gasUsed: bigint;
    logs: Array<{
        address: string;
        topics: string[];
        data: Buffer;
        blockNumber: number;
        blockHash: string;
        transactionHash: string;
        transactionIndex: number;
        logIndex: number;
    }>;
}

export class EVM {
    constructor(private stateDB: StateDB) {}

    async execute(_params: EVMExecutionParams): Promise<EVMExecutionResult> {
        return {
            gasUsed: BigInt(21000),
            logs: []
        };
    }

    async getStorageUpdates(): Promise<Map<Buffer, Buffer>> {
        return new Map();
    }
}
