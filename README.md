# Agent Communication Adapters

A TypeScript framework that implements adapter-style communication for multi-agent systems. It decouples agent logic from transport, serialization, and protocol concerns while enabling interoperability between heterogeneous agents.

## Project Structure

```
├── agent/                 # Core adapter framework
│   ├── types.ts           # Message, AgentIdentifier, Result, BROADCAST
│   ├── adapters.ts        # Communication, transport, and serialization interfaces
│   ├── base_adapter.ts    # BaseCommunicationAdapter
│   ├── json_protocol_adapter.ts   # JSON-based protocol adapter
│   ├── json_serializer.ts         # JSON serialization adapter
│   ├── in_memory_transport.ts     # In-memory/queue transport adapter
│   ├── agent.ts           # Generic agent that uses an adapter
│   └── index.ts           # Public exports
├── index.ts               # Library entry point
├── package.json
├── tsconfig.json
├── jest.config.js
└── .eslintrc.json
```

## Getting Started

```bash
npm install
npm run build
npm run check-types
npm run lint
npm test
```

## Usage Example

```typescript
import {
  Agent,
  AgentIdentifier,
  InMemoryTransportAdapter,
  JsonSerializer,
  JsonProtocolAdapter
} from './agent';

const transport = new InMemoryTransportAdapter();
const serializer = new JsonSerializer();
const adapter = new JsonProtocolAdapter(transport, serializer);

const agentA = new Agent({ name: 'AgentA', address: 'addrA', capabilities: new Set() }, adapter);
const agentB = new Agent({ name: 'AgentB', address: 'addrB', capabilities: new Set() }, adapter);

agentA.initialize({ endpoint: 'addrA' });
agentB.initialize({ endpoint: 'addrB' });

agentA.sendRequest({ name: 'AgentB', address: 'addrB', capabilities: new Set() }, 'hello');

agentB.processIncoming((msg) => {
  console.log('AgentB received:', msg);
});
```

## Architecture

The framework defines layered adapters:

- **Protocol adapters** translate domain `Message` objects to and from a serialized wire form.
- **Transport adapters** move serialized byte payloads between agents.
- **Serialization adapters** convert in-memory objects to bytes and back.
- **BaseCommunicationAdapter** composes a transport and serializer and exposes `send`, `receive`, `connect`, `disconnect`, `supports`, and `getStatus`.
- **Agent** provides a thin wrapper that uses a `CommunicationAdapter` to send requests and process an inbound message queue.

## Adapter Types (Future Work)

The interfaces are intended to be extended with:

- Protocol adapters for FIPA ACL, KQML, gRPC, JSON-RPC, and custom schemas.
- Transport adapters for HTTP/REST, WebSockets, Kafka, RabbitMQ, Redis, and pub/sub.
- Serialization adapters for JSON, Protocol Buffers, MessagePack, and domain-specific formats.
- Security/policy adapters for authentication, authorization, encryption, rate limiting, and content filtering.
- Observability adapters for logging, tracing, metrics, and audit trails.
- Bridge and federation adapters for cross-boundary agent systems.

## License

MIT
