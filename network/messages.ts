import { MessageType, MessageError } from './protocol_types';
import { crc32 } from 'crc';
import * as zlib from 'zlib';

/**
 * Message flags for controlling message behavior
 */
export enum MessageFlags {
    NONE = 0x0000,
    COMPRESSED = 0x0001,    // Message payload is compressed
    ENCRYPTED = 0x0002,     // Message payload is encrypted
    PRIORITY = 0x0004,      // Message should be processed with high priority
    REQUIRES_ACK = 0x0008   // Message requires acknowledgment
}

export class ProtocolMessage {
    private type: MessageType;
    private flags: MessageFlags;
    private payload: Buffer;
    private checksum: number;

    constructor(type: MessageType, payload: Buffer, flags: MessageFlags = MessageFlags.NONE) {
        this.type = type;
        this.flags = flags;
        this.payload = payload;
        this.checksum = this.calculateChecksum();
    }

    public getType(): MessageType {
        return this.type;
    }

    public getFlags(): MessageFlags {
        return this.flags;
    }

    public getPayload(): Buffer {
        return this.payload;
    }

    public getChecksum(): number {
        return this.checksum;
    }

    public async serialize(): Promise<Buffer> {
        let payload = this.payload;

        // Apply compression if flag is set
        if (this.flags & MessageFlags.COMPRESSED) {
            payload = await this.compressPayload(payload);
        }

        // Create header
        const header = Buffer.alloc(8);
        header.writeUInt8(this.type, 0);
        header.writeUInt16BE(this.flags, 1);
        header.writeUInt32BE(this.checksum, 3);
        header.writeUInt16BE(payload.length, 7);

        // Combine header and payload
        return Buffer.concat([header, payload]);
    }

    public static async deserialize(data: Buffer): Promise<ProtocolMessage> {
        if (data.length < 8) {
            throw new MessageError('Invalid message format: too short');
        }

        // Parse header
        const type = data.readUInt8(0) as MessageType;
        const flags = data.readUInt16BE(1) as MessageFlags;
        const checksum = data.readUInt32BE(3);
        const payloadLength = data.readUInt16BE(7);

        if (data.length < 8 + payloadLength) {
            throw new MessageError('Invalid message format: incomplete payload');
        }

        // Extract payload
        let payload = data.slice(8, 8 + payloadLength);

        // Decompress if needed
        if (flags & MessageFlags.COMPRESSED) {
            payload = Buffer.from(await this.decompressPayload(payload));
        }

        // Verify checksum
        const message = new ProtocolMessage(type, payload, flags);
        if (message.calculateChecksum() !== checksum) {
            throw new MessageError('Invalid message checksum');
        }

        return message;
    }

    private calculateChecksum(): number {
        return crc32(this.payload);
    }

    private async compressPayload(payload: Buffer): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            zlib.deflate(payload, (err, buffer) => {
                if (err) reject(err);
                else resolve(buffer);
            });
        });
    }

    private static async decompressPayload(payload: Buffer): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            zlib.inflate(payload, (err, buffer) => {
                if (err) reject(err);
                else resolve(buffer);
            });
        });
    }
} 