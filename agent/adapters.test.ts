import {
  Agent,
  AgentIdentifier,
  BROADCAST,
  InMemoryTransportAdapter,
  JsonProtocolAdapter,
  JsonSerializer,
  Message
} from './';

const serializer = new JsonSerializer();

describe('Agent communication adapters', () => {
  it('should send a request from one agent to another', () => {
    const transport = new InMemoryTransportAdapter();

    const alice: AgentIdentifier = { name: 'Alice', address: 'addrA', capabilities: new Set() };
    const bob: AgentIdentifier = { name: 'Bob', address: 'addrB', capabilities: new Set() };

    const aliceAgent = new Agent(alice, new JsonProtocolAdapter(transport, serializer));
    const bobAgent = new Agent(bob, new JsonProtocolAdapter(transport, serializer));

    aliceAgent.initialize({ endpoint: 'addrA' });
    bobAgent.initialize({ endpoint: 'addrB' });

    const result = aliceAgent.sendRequest(bob, 'ping');

    expect(result.success).toBe(true);
    expect(result.isFailure()).toBe(false);

    const received: Message[] = [];
    bobAgent.processIncoming((msg) => received.push(msg));

    expect(received.length).toBe(1);
    expect(received[0].sender.name).toBe('Alice');
    expect(received[0].receiver.name).toBe('Bob');
    expect(received[0].performative).toBe('REQUEST');
    expect(received[0].content).toBe('ping');
  });

  it('should broadcast a message to multiple listeners', () => {
    const transport = new InMemoryTransportAdapter();

    const alice: AgentIdentifier = { name: 'Alice', address: 'addrA', capabilities: new Set() };
    const bob: AgentIdentifier = { name: 'Bob', address: 'addrB', capabilities: new Set() };

    const aliceAgent = new Agent(alice, new JsonProtocolAdapter(transport, serializer));
    const bobAgent = new Agent(bob, new JsonProtocolAdapter(transport, serializer));

    aliceAgent.initialize({ endpoint: 'addrA' });
    bobAgent.initialize({ endpoint: 'addrB' });

    const result = aliceAgent.sendRequest(BROADCAST, 'announcement');
    expect(result.success).toBe(true);

    const received: Message[] = [];
    bobAgent.processIncoming((msg) => received.push(msg));

    expect(received.length).toBe(1);
    expect(received[0].content).toBe('announcement');
    expect(received[0].receiver.address).toBe('BROADCAST');
  });
});
