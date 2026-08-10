import { randomUUID } from 'crypto';

export interface AgentIdentifier {
  name: string;
  address: string;
  capabilities: Set<string>;
}

export const BROADCAST: AgentIdentifier = {
  name: 'BROADCAST',
  address: 'BROADCAST',
  capabilities: new Set<string>()
};

export interface Message {
  id: string;
  sender: AgentIdentifier;
  receiver: AgentIdentifier;
  performative: string;
  content: unknown;
  ontology: string;
  protocol: string;
  timestamp: Date;
  replyTo: string | null;
  metadata: Map<string, unknown>;
}

export class Result<T> {
  constructor(
    public readonly success: boolean,
    public readonly value?: T,
    public readonly error?: Error
  ) {}

  public isFailure(): boolean {
    return !this.success;
  }
}

export function createUUID(): string {
  return randomUUID();
}
