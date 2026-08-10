import { Message, Result } from './types';

export enum AdapterStatus {
  DISCONNECTED = 'disconnected',
  CONNECTED = 'connected',
  ERROR = 'error'
}

export interface CommunicationAdapter {
  readonly protocol: string;
  send(message: Message): Result<void>;
  receive(): Message | null;
  supports(adapterProtocol: string): boolean;
  connect(config: Record<string, unknown>): void;
  disconnect(): void;
  getStatus(): AdapterStatus;
}

export interface ProtocolAdapter extends CommunicationAdapter {
  translateOutgoing(message: Message): unknown;
  translateIncoming(raw: unknown): Message;
}

export interface TransportAdapter {
  connect(config: Record<string, unknown>): void;
  disconnect(): void;
  deliver(destination: string, payload: Buffer): Result<void>;
  listen(callback: (payload: Buffer) => void): void;
}

export interface SerializationAdapter {
  serialize(obj: unknown): Buffer;
  deserialize(data: Buffer): unknown;
  validate(schema: unknown, obj: unknown): boolean;
}
