import { AgentIdentifier, Message, Result, createUUID } from './types';
import { CommunicationAdapter } from './adapters';

export class Agent {
  constructor(
    private readonly id: AgentIdentifier,
    private readonly adapter: CommunicationAdapter
  ) {}

  public initialize(config: Record<string, unknown>): void {
    this.adapter.connect(config);
  }

  public sendRequest(receiver: AgentIdentifier, content: unknown): Result<void> {
    const message: Message = {
      id: createUUID(),
      sender: this.id,
      receiver,
      performative: 'REQUEST',
      content,
      ontology: '',
      protocol: this.adapter.protocol,
      timestamp: new Date(),
      replyTo: null,
      metadata: new Map()
    };

    return this.adapter.send(message);
  }

  public processIncoming(onMessage: (msg: Message) => void): void {
    let message = this.adapter.receive();
    while (message !== null) {
      onMessage(message);
      message = this.adapter.receive();
    }
  }
}
