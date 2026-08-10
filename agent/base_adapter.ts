import { EventEmitter } from 'events';
import { Message, Result } from './types';
import { AdapterStatus, CommunicationAdapter, SerializationAdapter, TransportAdapter } from './adapters';

export abstract class BaseCommunicationAdapter extends EventEmitter implements CommunicationAdapter {
  protected config: Record<string, unknown> = {};
  private inbox: Message[] = [];
  private status: AdapterStatus = AdapterStatus.DISCONNECTED;

  constructor(
    protected readonly transport: TransportAdapter,
    protected readonly serializer: SerializationAdapter,
    public readonly protocol: string
  ) {
    super();
  }

  public connect(config: Record<string, unknown>): void {
    this.config = config;
    this.transport.connect(config);
    this.transport.listen((payload) => this.onRawMessage(payload));
    this.status = AdapterStatus.CONNECTED;
  }

  public disconnect(): void {
    this.transport.disconnect();
    this.status = AdapterStatus.DISCONNECTED;
  }

  public send(message: Message): Result<void> {
    if (this.status !== AdapterStatus.CONNECTED) {
      return new Result(false, undefined, new Error('Adapter not connected'));
    }

    try {
      const serialized = this.translateOutgoing(message);
      const bytes = this.serializer.serialize(serialized);
      return this.transport.deliver(message.receiver.address, bytes);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return new Result(false, undefined, err);
    }
  }

  public receive(): Message | null {
    if (this.inbox.length === 0) {
      return null;
    }
    return this.inbox.shift() ?? null;
  }

  public supports(adapterProtocol: string): boolean {
    return adapterProtocol === this.protocol;
  }

  public getStatus(): AdapterStatus {
    return this.status;
  }

  private onRawMessage(rawBytes: Buffer): void {
    try {
      const rawObj = this.serializer.deserialize(rawBytes);
      const message = this.translateIncoming(rawObj);
      this.inbox.push(message);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);
    }
  }

  protected abstract translateOutgoing(message: Message): unknown;
  protected abstract translateIncoming(raw: unknown): Message;
}
