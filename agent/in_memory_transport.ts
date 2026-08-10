import { Result } from './types';
import { TransportAdapter } from './adapters';

export class InMemoryTransportAdapter implements TransportAdapter {
  private endpoint = 'default';
  private channels = new Map<string, Buffer[]>();
  private listeners = new Map<string, (payload: Buffer) => void>();

  public connect(config: Record<string, unknown>): void {
    if (typeof config.endpoint === 'string') {
      this.endpoint = config.endpoint;
    }
  }

  public disconnect(): void {
    this.listeners.delete(this.endpoint);
  }

  public deliver(destination: string, payload: Buffer): Result<void> {
    try {
      if (destination === 'BROADCAST') {
        for (const callback of this.listeners.values()) {
          callback(payload);
        }
        return new Result(true);
      }

      const queue = this.channels.get(destination) ?? [];
      queue.push(payload);
      this.channels.set(destination, queue);

      const listener = this.listeners.get(destination);
      if (listener) {
        listener(payload);
      }

      return new Result(true);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return new Result(false, undefined, err);
    }
  }

  public listen(callback: (payload: Buffer) => void): void {
    this.listeners.set(this.endpoint, callback);
  }
}
