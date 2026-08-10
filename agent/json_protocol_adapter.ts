import { BaseCommunicationAdapter } from './base_adapter';
import { AgentIdentifier, Message } from './types';
import { SerializationAdapter, TransportAdapter } from './adapters';

export class JsonProtocolAdapter extends BaseCommunicationAdapter {
  constructor(transport: TransportAdapter, serializer: SerializationAdapter) {
    super(transport, serializer, 'JSON-ACL');
  }

  public translateOutgoing(message: Message): Record<string, unknown> {
    return {
      id: message.id,
      sender: this.serializeIdentifier(message.sender),
      receiver: this.serializeIdentifier(message.receiver),
      performative: message.performative,
      content: message.content,
      ontology: message.ontology,
      protocol: this.protocol,
      timestamp: message.timestamp.toISOString(),
      replyTo: message.replyTo,
      metadata: Object.fromEntries(message.metadata)
    };
  }

  public translateIncoming(raw: unknown): Message {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Invalid message object');
    }

    const record = raw as Record<string, unknown>;
    return {
      id: this.readString(record.id),
      sender: this.parseIdentifier(record.sender),
      receiver: this.parseIdentifier(record.receiver),
      performative: this.readString(record.performative),
      content: record.content,
      ontology: typeof record.ontology === 'string' ? record.ontology : '',
      protocol: typeof record.protocol === 'string' ? record.protocol : this.protocol,
      timestamp: this.parseTimestamp(record.timestamp),
      replyTo: record.replyTo === null || record.replyTo === undefined ? null : this.readString(record.replyTo),
      metadata: this.parseMetadata(record.metadata)
    };
  }

  private serializeIdentifier(identifier: AgentIdentifier): Record<string, unknown> {
    return {
      name: identifier.name,
      address: identifier.address,
      capabilities: Array.from(identifier.capabilities)
    };
  }

  private parseIdentifier(raw: unknown): AgentIdentifier {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Invalid agent identifier');
    }

    const record = raw as Record<string, unknown>;
    return {
      name: typeof record.name === 'string' ? record.name : '',
      address: typeof record.address === 'string' ? record.address : '',
      capabilities: this.parseCapabilities(record.capabilities)
    };
  }

  private readString(raw: unknown): string {
    if (typeof raw !== 'string') {
      throw new Error(`Expected string, received ${typeof raw}`);
    }
    return raw;
  }

  private parseTimestamp(raw: unknown): Date {
    if (raw instanceof Date) {
      return raw;
    }
    if (typeof raw === 'string') {
      return new Date(raw);
    }
    return new Date();
  }

  private parseCapabilities(raw: unknown): Set<string> {
    if (!Array.isArray(raw)) {
      return new Set();
    }
    return new Set(raw.map((item) => String(item)));
  }

  private parseMetadata(raw: unknown): Map<string, unknown> {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return new Map();
    }
    return new Map(Object.entries(raw));
  }
}
