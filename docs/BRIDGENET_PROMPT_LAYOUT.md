# Bridgenet Master Prompt Layout

> Three surfaces, one product: **nexeth CLI** → **Bridgenet API** → **Operator Portal**

## One-liner

Build a local cross-chain testnet where deposits on Chain A provably mint on Chain B, with a relayer, bridge contracts, CLI tooling, and an operator portal.

## Context

- **Existing repo:** Nexeth — TypeScript Ethereum-style node skeleton (mempool, blocks, sync, validation)
- **Current state:** Single-chain stub, not production-ready, no bridge logic
- **Do NOT** optimize for "plain blockchain completeness"
- **Optimize for:** End-to-end cross-chain transfer demo that works reliably

## Goal

Create a **bridgenet** — a sandbox with 2+ chains + bridge + relayer + observability + client update CLI + operator portal.

**Success** = run one command and see:

```
deposit on Chain A → relayer picks up → mint on Chain B → balance updates in UI/logs
```

## Non-goals

- Mainnet sync
- Full Ethereum client parity
- Production security audit
- Finishing every legacy P2P/consensus stub

---

## Three Surfaces (One Product)

```
nexeth CLI  →  install / doctor / update / bridge demo
     ↓
Bridgenet API  →  relayer + message index + chain health
     ↓
Operator Portal  →  dashboard, messages, client updates, demo wizard
```

---

## Architecture

### Chains

| Chain | Role | Tech |
|-------|------|------|
| Chain A | Source (lock/unlock) | Local simulated chain OR Anvil/Hardhat OR Sepolia |
| Chain B | Destination (mint/burn) | Nexeth app-chain (minimal in-process ledger) |

### Bridge model (M1)

- [x] Trusted relayer (fastest MVP)
- [ ] Optimistic (challenge window) — M4+
- [ ] Light-client / ZK (stretch)

### Components

| Component | Path | Purpose |
|-----------|------|---------|
| Bridge contracts | `bridgenet/contracts/` | LockBridge (A), MintBridge (B) — Solidity reference + TS runtime |
| Chain A | `bridgenet/chain-a/` | Simulated lock chain (Anvil-compatible API surface) |
| Chain B | `bridgenet/chain-b/` | App-chain ledger accepting bridge mints |
| Relayer | `bridgenet/relayer/` | Watch `Locked` → submit `mint` with dedup |
| API | `bridgenet/api/` | REST + WebSocket message feed |
| Orchestrator | `bridgenet/orchestrator/` | Start full stack |
| CLI | `cli/` | `nexeth` command tree |
| Portal | `portal/public/` | Dark ops console dashboard |

---

## Client Update CLI (`nexeth`)

### Command tree

```
nexeth init                    # Create ~/.nexeth/config.yaml
nexeth doctor                  # Health check: API, chains, relayer
nexeth update check|apply|rollback   # Client update manifest (M3)
nexeth bridge demo             # Run deposit → mint demo
nexeth bridge messages         # List bridge messages (JSON/table)
nexeth node genesis load       # Load genesis into Chain B
nexeth portal open             # Open operator portal in browser
```

### Config schema (`~/.nexeth/config.yaml`)

```yaml
apiUrl: http://127.0.0.1:3847
portalUrl: http://127.0.0.1:3847
chainA:
  type: simulated   # simulated | anvil | sepolia
  rpcUrl: http://127.0.0.1:8545
chainB:
  chainId: 424242
  dataDir: ~/.nexeth/chain-b
relayer:
  confirmations: 1
  pollIntervalMs: 500
securityModel: trusted-relayer   # trusted-relayer | multisig | optimistic
json: false                      # JSON output for CI/portal
```

### Update manifest model (M3)

```json
{
  "version": "1.1.0",
  "channel": "stable",
  "components": ["cli", "relayer", "portal"],
  "migrations": []
}
```

---

## Operator Portal

### Routes

| Route | Purpose |
|-------|---------|
| `/` | Dashboard — chain health, recent transfers, security badge |
| `/messages` | Message table with status filters |
| `/messages/:id` | Transfer detail + timeline |
| `/chains` | Chain A/B status, block height, balances |
| `/client` | Client version, update check/apply (M3) |
| `/settings` | API URL, security model display |
| `/demo` | Guided deposit → mint wizard |

### Design tokens

| Token | Value |
|-------|-------|
| Background | `#0d1117` |
| Surface | `#161b22` |
| Border | `#30363d` |
| Text | `#e6edf3` |
| Muted | `#8b949e` |
| Pending | `#d29922` |
| OK / Minted | `#3fb950` |
| Failed | `#f85149` |
| Accent | `#58a6ff` |
| Font UI | Inter, system-ui |
| Font Mono | JetBrains Mono, monospace |

### Components

- `StatusPill` — pending / relaying / minted / failed
- `MessageTable` — sortable bridge message list
- `TransferTimeline` — LOCKED → RELAYING → MINTED steps
- `UpdateBanner` — client update available (M3)
- `SecurityBadge` — trusted-relayer / optimistic / ZK

### API contract

```
GET  /api/health
GET  /api/chains
GET  /api/messages
GET  /api/messages/:id
POST /api/demo/lock          # trigger demo deposit on Chain A
WS   /ws                       # live message feed
```

WebSocket events: `message:created`, `message:updated`, `chain:heartbeat`

---

## Bridge Event Contract

### Chain A — LockBridge

```solidity
event Locked(bytes32 indexed messageId, address indexed sender, address recipientOnB, uint256 amount);
function lock(address recipientOnB) payable;
function unlock(bytes32 messageId, address recipient, uint256 amount, bytes proof);
```

### Chain B — MintBridge

```solidity
event Minted(bytes32 indexed messageId, address indexed recipient, uint256 amount);
function mint(bytes32 messageId, address recipient, uint256 amount, bytes proof);
function burn(address recipientOnA, uint256 amount);
```

### Relayer rules

- `messageId = keccak256(chainId, txHash, logIndex)`
- Never mint same `messageId` twice (idempotent)
- Wait N confirmations on Chain A before relay

---

## Milestones

| M | Bridgenet | CLI | Portal |
|---|-----------|-----|--------|
| M1 | A→B demo works | `doctor`, `bridge demo` | Dashboard + live feed |
| M2 | Message index persisted | `bridge messages`, `update check` | Table + detail page |
| M3 | Idempotent relayer + restart recovery | `update apply` | Client page + update banner |
| M4 | Chaos / reorg scenarios | `chaos` script | Demo wizard + timeline |

---

## File layout (target)

```
bridgenet/
  contracts/       # Solidity: LockBridge, MintBridge
  chain-a/           # Simulated / Anvil Chain A
  chain-b/           # Nexeth app-chain (Chain B)
  relayer/           # Event watcher + submitter
  api/               # REST + WebSocket server
  orchestrator/      # npm run bridgenet entry
  shared/            # Types, messageId utils
cli/
  bin/nexeth.ts
  commands/
  config/
portal/
  public/            # Static portal assets
docs/
  BRIDGENET_PROMPT_LAYOUT.md
```

---

## Reuse vs skip (existing repo)

| Reuse | Skip for M1 |
|-------|-------------|
| Mental model: mempool → validation → state | Full P2P networking |
| `memory/mempool.ts` patterns (reference) | `chain/consensus.ts` duplicate |
| `verification/` concepts | Broken legacy compile path |
| `state/state.ts` ideas → Chain B ledger | Mainnet sync, devp2p wire |

---

## Acceptance criteria (M1)

- [ ] `npm run bridgenet` brings up full stack
- [ ] `npm run demo:bridge` completes A→B transfer locally
- [ ] `nexeth doctor` reports healthy chains + API
- [ ] `nexeth bridge demo` triggers deposit → mint
- [ ] Portal at `http://127.0.0.1:3847` shows MINTED status
- [ ] Logs show: `LOCKED → RELAYING → MINTED`
- [ ] Second relay of same `messageId` is rejected
- [ ] README quickstart explains architecture in plain English

---

## Open decisions

| Decision | M1 choice |
|----------|-----------|
| Chain A | Local simulated (Anvil-compatible API for M2) |
| Bridge security | Trusted relayer |
| Chain B | New minimal app-chain in `bridgenet/chain-b/` |
| UI | CLI + minimal web portal |

---

## Short agent prompt (copy-paste)

```markdown
Turn nexeth into a bridgenet MVP, not a plain blockchain.

Build:
- Chain A (simulated): LockBridge with Locked events
- Chain B (app-chain): MintBridge + ledger accepting mints
- TypeScript relayer: watch Locked → submit mint with messageId dedup
- Bridgenet API: REST + WebSocket on :3847
- nexeth CLI: doctor, bridge demo, portal open
- Portal: dark ops dashboard with live message feed
- `npm run bridgenet` + `npm run demo:bridge` one-command demo

M1 only: terminal + portal proof of deposit→mint.
Reuse state/mempool/validation concepts; skip finishing consensus/P2P stubs.
Exclude broken legacy modules from bridgenet tsconfig.

Deliver: working demo, docs/BRIDGENET_PROMPT_LAYOUT.md, idempotent relayer,
clear logs (LOCKED → RELAYING → MINTED).
```

---

## Cool factor differentiators (M4+)

- Transfer status API: `GET /bridge/messages/:id`
- Chaos mode: `npm run chaos` kills relayer mid-transfer, verifies recovery
- Reorg simulator on Chain A (local only)
- Dashboard showing in-flight messages with latency histogram
- Testnet faucet + block explorer links
