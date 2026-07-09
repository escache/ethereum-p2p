// Network Management Implementation
import { Socket } from 'net';
import { EventEmitter } from 'events';
import {
    MessageType,
    NetworkPeer,
    PeerStatus
} from './protocol';
import { BlockData } from './types';

export interface Peer {
    id: string;
    host: string;
    port: number;
    status: PeerStatus;
}

export interface NetworkBlockData extends Omit<BlockData, 'header'> {
    header: NetworkBlockHeader;
}

export interface NetworkBlockHeader {
    number: number;
    hash: string;
    parentHash: string;
    timestamp: number;
    difficulty: bigint;
    nonce: Buffer;
    transactionsRoot: string;
    receiptsRoot: string;
    stateRoot: string;
    miner: string;
    extraData: Buffer;
    gasLimit: bigint;
    gasUsed: bigint;
}

export class NetworkManager extends EventEmitter {
    private peers: Map<string, NetworkPeer>;
    private maxPeers: number;

    constructor(config: NetworkConfig = {}) {
        super();
        this.peers = new Map();
        this.maxPeers = config.maxPeers || 25;
    }

    private parseEnode(enode: string): { host: string; port: number; id: string } {
        const match = enode.match(/^enode:\/\/([a-f0-9]{128})@([^:]+):(\d+)$/i);
        if (!match) {
            throw new Error('Invalid enode format');
        }
        return {
            id: match[1],
            host: match[2],
            port: parseInt(match[3], 10)
        };
    }

    private createMessage(type: MessageType, payload: Buffer): Buffer {
        const header = Buffer.alloc(5);
        header.writeUInt8(type, 0);
        header.writeUInt32BE(payload.length, 1);
        return Buffer.concat([header, payload]);
    }

    private async sendMessage(peer: NetworkPeer, message: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            peer.write(message, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }

    private createBlockMessage(block: NetworkBlockData): Buffer {
        const headerBuffer = Buffer.concat([
            Buffer.from(block.header.hash || ''),
            Buffer.from(block.header.parentHash),
            Buffer.alloc(8).fill(block.header.number),
            Buffer.alloc(8).fill(block.header.timestamp),
            Buffer.from(block.header.difficulty.toString(16), 'hex'),
            block.header.nonce,
            Buffer.from(block.header.transactionsRoot)
        ]);

        return this.createMessage(MessageType.BLOCK, headerBuffer);
    }

    async connectToPeer(enode: string): Promise<void> {
        const peerInfo = this.parseEnode(enode);

        if (this.peers.size >= this.maxPeers) {
            throw new Error('Maximum peer limit reached');
        }

        const socket = new Socket() as NetworkPeer;
        socket.id = peerInfo.id;
        socket.host = peerInfo.host;
        socket.port = peerInfo.port;
        socket.status = PeerStatus.CONNECTING;

        socket.connect(peerInfo.port, peerInfo.host);

        socket.on('connect', () => {
            socket.status = PeerStatus.CONNECTED;
            this.peers.set(peerInfo.id, socket);
            this.emit('peer:connected', peerInfo.id);
        });

        socket.on('error', (error) => {
            socket.status = PeerStatus.DISCONNECTED;
            this.peers.delete(peerInfo.id);
            this.emit('peer:error', peerInfo.id, error);
        });

        socket.on('close', () => {
            socket.status = PeerStatus.DISCONNECTED;
            this.peers.delete(peerInfo.id);
            this.emit('peer:disconnected', peerInfo.id);
        });
    }

    async broadcastMessage(type: MessageType, payload: Buffer): Promise<void> {
        const message = this.createMessage(type, payload);
        const promises = Array.from(this.peers.values()).map(peer =>
            this.sendMessage(peer, message)
        );
        await Promise.all(promises);
    }

    getPeerList(): PeerInfo[] {
        return Array.from(this.peers.values())
            .filter(peer => peer.status === PeerStatus.CONNECTED)
            .map(peer => ({
                id: peer.id,
                host: peer.host,
                port: peer.port,
                status: peer.status
            }));
    }

    async getConnectedPeers(): Promise<Peer[]> {
        return this.getPeerList();
    }

    async sendBlock(peerId: string, block: NetworkBlockData): Promise<void> {
        const peer = this.peers.get(peerId);
        if (!peer || peer.status !== PeerStatus.CONNECTED) {
            throw new Error('Peer not connected');
        }

        try {
            const message = this.createBlockMessage(block);
            await this.sendMessage(peer, message);
            this.emit('block:sent', block.header.hash, peerId);
        } catch (error) {
            this.emit('block:send:failed', block.header.hash, peerId, error);
            throw error;
        }
    }
}

interface PeerInfo {
    id: string;
    host: string;
    port: number;
    status: PeerStatus;
}

interface NetworkConfig {
    maxPeers?: number;
}
