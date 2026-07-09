// Validation Rules Implementation
import { Transaction } from '../network/types';
import { StateManager } from '../state/state';
import { ValidationRule, ValidationContext, ValidationResult } from './transaction_validator';
import { createHash } from 'crypto';

// Gas limits and format definitions
const GAS_LIMITS = {
  BASE_TX: BigInt(21000), // Base transaction cost
  CONTRACT_CREATION: BigInt(53000), // Base cost for contract creation
  ZERO_BYTE: BigInt(4), // Cost per zero byte of data
  NON_ZERO_BYTE: BigInt(68), // Cost per non-zero byte of data
  SSTORE_SET: BigInt(20000), // Cost of SSTORE when setting from zero
  SSTORE_RESET: BigInt(5000), // Cost of SSTORE when setting to zero
  SSTORE_REFUND: BigInt(15000), // Refund when setting to zero from non-zero
  MAX_GAS_LIMIT: BigInt(15000000), // Maximum gas limit per block
  MIN_GAS_LIMIT: BigInt(5000), // Minimum gas limit per transaction
  MAX_GAS_PRICE: BigInt(10000000000000), // Maximum gas price (10000 Gwei)
  MIN_GAS_PRICE: BigInt(1000000000) // Minimum gas price (1 Gwei)
};

// Format definitions and validation regex patterns
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const HEX_DATA_REGEX = /^(0x)?([0-9a-fA-F]{2})*$/;
const SIGNATURE_COMPONENT_REGEX = /^[0-9a-fA-F]{64}$/;
const NONCE_REGEX = /^[0-9]+$/;
const GAS_PRICE_REGEX = /^[0-9]+$/;
const GAS_LIMIT_REGEX = /^[0-9]+$/;
const VALUE_REGEX = /^[0-9]+$/;

// Maximum allowed pending nonces per account
const MAX_PENDING_NONCES = 10;

// Maximum nonce gap allowed between current and pending
const MAX_NONCE_GAP = 100;

export class NonceValidator implements ValidationRule {
    private nonceCache: Map<string, Set<number>>;

    constructor(private stateManager: StateManager) {
        this.nonceCache = new Map();
    }

    private getOrCreateNonceSet(address: string): Set<number> {
        let nonceSet = this.nonceCache.get(address);
        if (!nonceSet) {
            nonceSet = new Set();
            this.nonceCache.set(address, nonceSet);
        }
        return nonceSet;
    }

    private isNonceUsed(address: string, nonce: number): boolean {
        const nonceSet = this.getOrCreateNonceSet(address);
        return nonceSet.has(nonce);
    }

    private addNonceToCache(address: string, nonce: number): void {
        const nonceSet = this.getOrCreateNonceSet(address);
        nonceSet.add(nonce);
    }

    private validateNonceFormat(nonce: number): boolean {
        return NONCE_REGEX.test(nonce.toString());
    }

    async validate(tx: Transaction, context: ValidationContext): Promise<ValidationResult> {
        // Validate nonce format
        if (!this.validateNonceFormat(tx.nonce)) {
            return {
                isValid: false,
                error: 'Invalid nonce format',
                details: 'Nonce must be a positive integer'
            };
        }

        const accountState = await this.stateManager.getAccountState(tx.from);
        const currentNonce = accountState.nonce;
        const nonceSet = this.getOrCreateNonceSet(tx.from);

        // Check for duplicate nonce
        if (this.isNonceUsed(tx.from, tx.nonce)) {
            return {
                isValid: false,
                error: 'Nonce already used',
                details: { nonce: tx.nonce }
            };
        }

        // Prevent replay attacks
        if (tx.nonce < currentNonce) {
            return {
                isValid: false,
                error: 'Nonce too low - transaction replay prevented',
                details: { 
                    currentNonce,
                    txNonce: tx.nonce,
                    difference: currentNonce - tx.nonce
                }
            };
        }

        // Check nonce gap
        if (tx.nonce > currentNonce + MAX_NONCE_GAP) {
            return {
                isValid: false,
                error: 'Nonce gap too large',
                details: {
                    currentNonce,
                    txNonce: tx.nonce,
                    maxGap: MAX_NONCE_GAP
                }
            };
        }

        // Check pending transaction limit
        if (nonceSet.size >= MAX_PENDING_NONCES) {
            return {
                isValid: false,
                error: 'Too many pending transactions',
                details: {
                    pendingCount: nonceSet.size,
                    maxAllowed: MAX_PENDING_NONCES
                }
            };
        }

        // Validate nonce sequence
        const expectedNonce = currentNonce + nonceSet.size;
        if (tx.nonce !== expectedNonce) {
            return {
                isValid: false,
                error: 'Invalid nonce sequence',
                details: {
                    expected: expectedNonce,
                    received: tx.nonce
                }
            };
        }

        // Cache the nonce
        this.addNonceToCache(tx.from, tx.nonce);

        return { isValid: true };
    }

    // Clear processed nonce from cache
    public clearNonce(address: string, nonce: number): void {
        const nonceSet = this.nonceCache.get(address);
        if (nonceSet) {
            nonceSet.delete(nonce);
            // Clean up empty sets
            if (nonceSet.size === 0) {
                this.nonceCache.delete(address);
            }
        }
    }
}

export class BalanceValidator implements ValidationRule {
    constructor(private stateManager: StateManager) {}

    async validate(tx: Transaction, context: ValidationContext): Promise<ValidationResult> {
        // Validate address format
        if (!this.isValidAddress(tx.from) || !this.isValidAddress(tx.to)) {
            return {
                isValid: false,
                error: 'Invalid address format',
                details: 'Addresses must be 40 character hex strings with 0x prefix'
            };
        }
        // Validate value format and range
        const valueStr = tx.value.toString();
        if (!VALUE_REGEX.test(valueStr)) {
            return {
                isValid: false,
                error: 'Invalid value format',
                details: 'Value must be a positive number'
            };
        }

        // Check for overflow
        try {
            if (BigInt(valueStr) < 0) {
                return {
                    isValid: false,
                    error: 'Invalid value range',
                    details: 'Value cannot be negative'
                };
            }
        } catch (e) {
            return {
                isValid: false, 
                error: 'Invalid value',
                details: 'Value is not a valid number'
            };
        }

        // VALIDATE_BALANCE_SEQUENCE
        const accountState = await this.stateManager.getAccountState(tx.from);
        const totalCost = tx.value + (tx.gasLimit * tx.gasPrice);

        if (accountState.balance < totalCost) {
            return {
                isValid: false,
                error: 'Insufficient balance',
                details: {
                    balance: accountState.balance.toString(),
                    required: totalCost.toString()
                }
            };
        }

        return { isValid: true };
    }

    private isValidAddress(address: string): boolean {
        return ADDRESS_REGEX.test(address);
    }
}

export class GasValidator implements ValidationRule {
    constructor(private stateManager: StateManager) {}

    async validate(tx: Transaction, context: ValidationContext): Promise<ValidationResult> {
        // Validate gas price format
        if (!GAS_PRICE_REGEX.test(tx.gasPrice.toString())) {
            return {
                isValid: false,
                error: 'Invalid gas price format',
                details: 'Gas price must be a positive number'
            };
        }

        // Validate gas limit format
        if (!GAS_LIMIT_REGEX.test(tx.gasLimit.toString())) {
            return {
                isValid: false,
                error: 'Invalid gas limit format',
                details: 'Gas limit must be a positive number'
            };
        }

        // Validate gas price limits
        if (!this.isValidGasPrice(tx.gasPrice)) {
            return {
                isValid: false,
                error: 'Invalid gas price',
                details: `Gas price must be between ${GAS_LIMITS.MIN_GAS_PRICE} and ${GAS_LIMITS.MAX_GAS_PRICE} wei`
            };
        }

        // VALIDATE_GAS_SEQUENCE
        const blockGasLimit = 30_000_000n;

        if (tx.gasLimit > blockGasLimit || tx.gasLimit > GAS_LIMITS.MAX_GAS_LIMIT) {
            return {
                isValid: false,
                error: 'Gas limit exceeds maximum',
                details: {
                    txGasLimit: tx.gasLimit.toString(),
                    blockGasLimit: blockGasLimit.toString(),
                    maxAllowed: GAS_LIMITS.MAX_GAS_LIMIT.toString()
                }
            };
        }

        if (tx.gasLimit < GAS_LIMITS.MIN_GAS_LIMIT) {
            return {
                isValid: false,
                error: 'Gas limit below minimum',
                details: {
                    provided: tx.gasLimit.toString(),
                    minimum: GAS_LIMITS.MIN_GAS_LIMIT.toString()
                }
            };
        }

        const estimatedGas = await this.estimateGasUsage(tx);
        if (tx.gasLimit < estimatedGas) {
            return {
                isValid: false,
                error: 'Gas limit too low',
                details: {
                    provided: tx.gasLimit.toString(),
                    required: estimatedGas.toString()
                }
            };
        }

        return { isValid: true };
    }

    private isValidGasPrice(gasPrice: bigint): boolean {
        return gasPrice >= GAS_LIMITS.MIN_GAS_PRICE && gasPrice <= GAS_LIMITS.MAX_GAS_PRICE;
    }

    private async estimateGasUsage(tx: Transaction): Promise<bigint> {
        let estimate = GAS_LIMITS.BASE_TX;

        // Add cost for contract creation
        if (!tx.to) {
            estimate += GAS_LIMITS.CONTRACT_CREATION;
        }

        // Add data costs
        const data = tx.data.toString('hex');
        let zeroBytes = 0;
        let nonZeroBytes = 0;
        
        for (let i = 0; i < data.length; i += 2) {
            if (data.substr(i, 2) === '00') {
                zeroBytes++;
            } else {
                nonZeroBytes++;
            }
        }

        estimate += BigInt(zeroBytes) * GAS_LIMITS.ZERO_BYTE;
        estimate += BigInt(nonZeroBytes) * GAS_LIMITS.NON_ZERO_BYTE;

        return estimate;
    }
}

export class SignatureValidator implements ValidationRule {
    constructor(private stateManager: StateManager) {}

    async validate(tx: Transaction, context: ValidationContext): Promise<ValidationResult> {
        // Validate signature components
        if (!this.isValidSignatureComponent(tx.r) || !this.isValidSignatureComponent(tx.s)) {
            return {
                isValid: false,
                error: 'Invalid signature format',
                details: 'R and S values must be 64 character hex strings'
            };
        }

        if (!this.isValidV(tx.v)) {
            return {
                isValid: false,
                error: 'Invalid V value',
                details: 'V must be 27 or 28 for legacy transactions'
            };
        }

        // VALIDATE_SIGNATURE_SEQUENCE
        try {
            const isValid = await this.verifySignature(tx);
            if (!isValid) {
                return {
                    isValid: false,
                    error: 'Invalid signature'
                };
            }

            const signer = await this.recoverSigner(tx);
            if (signer.toLowerCase() !== tx.from.toLowerCase()) {
                return {
                    isValid: false,
                    error: 'Signer does not match from address',
                    details: { signer, from: tx.from }
                };
            }

            return { isValid: true };
        } catch (error) {
            return {
                isValid: false,
                error: 'Signature validation failed',
                details: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private isValidSignatureComponent(component: string): boolean {
        return SIGNATURE_COMPONENT_REGEX.test(component);
    }

    private isValidV(v: number): boolean {
        return v === 27 || v === 28;
    }

    private async verifySignature(tx: Transaction): Promise<boolean> {
        // VERIFY_SIGNATURE_SEQUENCE
        const messageHash = this.hashTransaction(tx);
        // Implement signature verification logic
        return true; // Placeholder
    }

    private async recoverSigner(tx: Transaction): Promise<string> {
        // RECOVER_SIGNER_SEQUENCE
        const messageHash = this.hashTransaction(tx);
        // Implement signer recovery logic
        return tx.from; // Placeholder
    }

    private hashTransaction(tx: Transaction): Buffer {
        // HASH_TRANSACTION_SEQUENCE
        const encodedTx = this.encodeTx(tx);
        return createHash('keccak256').update(encodedTx).digest();
    }

    private encodeTx(tx: Transaction): Uint8Array {
        // Validate input data format
        if (!this.isValidData(tx.data)) {
            throw new Error('Invalid transaction data format');
        }

        // RLP encode the transaction fields in order:
        // nonce, gasPrice, gasLimit, to, value, data, v, r, s
        const txFields = [
            tx.nonce,
            tx.gasPrice,
            tx.gasLimit,
            tx.to,
            tx.value,
            tx.data,
            tx.v,
            tx.r,
            tx.s
        ];

        // Convert fields to Uint8Arrays and RLP encode
        const rlpFields = txFields.map(field => {
            if (typeof field === 'boolean') {
                return new Uint8Array([field ? 1 : 0]);
            }
            if (typeof field === 'number') {
                // Convert number to hex string without leading zeros
                const hex = field === 0 ? '00' : field.toString(16);
                return new Uint8Array(
                    hex.length % 2 ? 
                    Buffer.from('0' + hex, 'hex') : 
                    Buffer.from(hex, 'hex')
                );
            }
            if (typeof field === 'string') {
                return new Uint8Array(
                    Buffer.from(field.replace('0x', ''), 'hex')
                );
            }
            return new Uint8Array(0);
        });

        // Implement basic RLP encoding
        const encodeLength = (len: number, offset: number): Uint8Array => {
            if (len < 56) {
                return new Uint8Array([len + offset]);
            }
            const hexLength = len.toString(16);
            const lengthOfLength = hexLength.length / 2;
            return new Uint8Array([
                offset + 55 + lengthOfLength,
                ...Buffer.from(hexLength, 'hex')
            ]);
        };

        // Concatenate all encoded fields
        const encodedFields = rlpFields.map(field => {
            if (field.length === 1 && field[0] < 128) {
                return field;
            }
            return new Uint8Array([
                ...encodeLength(field.length, 128),
                ...field
            ]);
        });

        const totalLength = encodedFields.reduce((sum, field) => sum + field.length, 0);
        const result = new Uint8Array([
            ...encodeLength(totalLength, 192),
            ...encodedFields.reduce((acc, field) => new Uint8Array([...acc, ...field]), new Uint8Array(0))
        ]);

        return result;
    }

    private isValidData(data: Buffer): boolean {
        // Check if data is valid hex
        return HEX_DATA_REGEX.test(data.toString('hex'));
    }
}