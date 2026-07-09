# Nexeth Bridgenet

A local cross-chain testnet where deposits on **Chain A** mint on **Chain B**, with a relayer, `nexeth` CLI, and operator portal.

> Plain blockchain skeleton → **bridgenet product**: CLI + API + portal, not mainnet sync.

## Quick start (5 minutes)

```bash
npm install
npm run bridgenet          # API + relayer + portal on :3847
```

In another terminal:

```bash
npm run demo:bridge        # deposit → mint demo (LOCKED → RELAYING → MINTED)
npm run nexeth -- doctor   # health check
npm run nexeth -- bridge demo
npm run nexeth -- portal open
```

Open the portal: **http://127.0.0.1:3847**

## Architecture

```
nexeth CLI  →  Bridgenet API (:3847)  →  Operator Portal
                    ↓
              Relayer watches Chain A Locked events
                    ↓
              Mints on Chain B (app-chain)
```

| Component | Path | Role |
|-----------|------|------|
| Chain A | `bridgenet/chain-a/` | Simulated lock chain (Anvil-ready for M2) |
| Chain B | `bridgenet/chain-b/` | Nexeth app-chain ledger |
| Relayer | `bridgenet/relayer/` | `Locked` → `mint` with messageId dedup |
| API | `bridgenet/api/` | REST + WebSocket live feed |
| CLI | `cli/` | `nexeth doctor`, `bridge demo`, `portal open` |
| Portal | `portal/public/` | Dark ops dashboard |
| Contracts | `bridgenet/contracts/` | Solidity reference (LockBridge, MintBridge) |

**Security model (M1):** trusted relayer

## CLI commands

```
nexeth init                 # ~/.nexeth/config.yaml
nexeth doctor               # API, chains, relayer health
nexeth bridge demo          # Run deposit → mint
nexeth bridge messages      # List transfers
nexeth portal open          # Open operator portal
```

Add `--json` for CI/portal integration.

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Stack health |
| `GET /api/messages` | All bridge messages |
| `GET /api/messages/:id` | Single message + timeline |
| `POST /api/demo/lock` | Trigger demo deposit |
| `WS /ws` | Live message feed |

## Legacy node skeleton

The original P2P/consensus modules (`chain/`, `network/`, etc.) remain as a learning skeleton. They are **not** required for bridgenet and are excluded from the default build (`tsconfig.bridgenet.json`).

## Docs

- [Bridgenet prompt layout](docs/BRIDGENET_PROMPT_LAYOUT.md) — master spec for CLI, portal, and milestones

## Milestones

| M | Status |
|---|--------|
| M1 — A→B demo, CLI, portal | ✓ |
| M2 — Message persistence, Anvil Chain A | planned |
| M3 — Client updates, idempotent restart | planned |
| M4 — Chaos mode, demo wizard polish | planned |

## License

MIT
