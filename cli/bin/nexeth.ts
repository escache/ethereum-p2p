#!/usr/bin/env node
/**
 * nexeth CLI — install / doctor / update / bridge demo / client
 */
import { initConfig, loadConfig } from '../config/load';
import { runDoctor } from '../commands/doctor';
import { runBridgeDemo, runBridgeMessages } from '../commands/bridge';
import { runPortalOpen } from '../commands/portal';
import {
  runClientDeposit,
  runClientWatch,
  runClientBalance,
  runClientAccounts,
  runBridgeTx,
} from '../commands/client';

const args = process.argv.slice(2);
const jsonFlag = args.includes('--json');
const command = args.filter((a) => !a.startsWith('--') && !a.startsWith('-'))[0];
const subcommand = args.filter((a) => !a.startsWith('--') && !a.startsWith('-'))[1];
const positional = args.filter((a) => !a.startsWith('--') && !a.startsWith('-'))[2];

async function main(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  const config = loadConfig();
  if (jsonFlag) config.json = true;

  let code = 0;

  switch (command) {
    case 'init':
      console.log(`Created ${initConfig()}`);
      break;

    case 'doctor':
      code = await runDoctor(config, config.json);
      break;

    case 'bridge':
      if (subcommand === 'demo') {
        code = await runBridgeDemo(config, config.json);
      } else if (subcommand === 'messages') {
        code = await runBridgeMessages(config, config.json);
      } else if (subcommand === 'tx' && positional) {
        code = await runBridgeTx(config, positional);
      } else {
        console.error('Usage: nexeth bridge demo|messages|tx <messageId>');
        code = 1;
      }
      break;

    case 'client':
      if (subcommand === 'deposit') {
        code = await runClientDeposit(config, args);
      } else if (subcommand === 'watch') {
        code = await runClientWatch(config, args);
      } else if (subcommand === 'balance') {
        code = await runClientBalance(config, args);
      } else if (subcommand === 'accounts') {
        code = runClientAccounts();
      } else {
        console.error('Usage: nexeth client deposit|watch|balance|accounts');
        code = 1;
      }
      break;

    case 'portal':
      if (subcommand === 'open') {
        code = runPortalOpen(config);
      } else {
        console.error('Usage: nexeth portal open');
        code = 1;
      }
      break;

    case 'update':
      console.log('Client updates available in M3. Current: 1.0.0-bridgenet-m1');
      break;

    case 'node':
      if (subcommand === 'genesis' && positional === 'load') {
        console.log('Genesis import via portal/API in M2.');
      } else {
        console.error('Usage: nexeth node genesis load');
        code = 1;
      }
      break;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      code = 1;
  }

  process.exit(code);
}

function printHelp(): void {
  console.log(`
  nexeth — Bridgenet CLI

  Commands:
    init                      Create ~/.nexeth/config.yaml
    doctor                    Health check (API, chains, relayer)
    bridge demo               Run deposit → mint demo
    bridge messages           List bridge messages
    bridge tx <messageId>     Full transaction details (both chains)
    client deposit            Person A — lock on Chain A (--from alice --to bob --amount 1)
    client watch              Person B — watch Chain B for incoming mints (--as bob)
    client balance            Check balance (--as bob --chain b)
    client accounts           List labeled test accounts
    portal open               Open operator portal

  Options:
    --json                    JSON output for CI/portal integration
    --verbose / -v            Geth-style full tx receipts

  Live two-client demo:
    npm run bridgenet         # terminal 1 — server
    npm run demo:live         # terminal 2 — Bob watches, Alice deposits

  Or manually:
    npm run nexeth -- client watch --as bob     # terminal 2
    npm run nexeth -- client deposit --verbose  # terminal 3
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
