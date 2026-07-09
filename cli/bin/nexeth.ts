#!/usr/bin/env node
/**
 * nexeth CLI — install / doctor / update / bridge demo
 */
import { initConfig, loadConfig } from '../config/load';
import { runDoctor } from '../commands/doctor';
import { runBridgeDemo, runBridgeMessages } from '../commands/bridge';
import { runPortalOpen } from '../commands/portal';

const args = process.argv.slice(2);
const jsonFlag = args.includes('--json');
const command = args.filter((a) => !a.startsWith('--'))[0];
const subcommand = args.filter((a) => !a.startsWith('--'))[1];

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
      } else {
        console.error('Usage: nexeth bridge demo|messages');
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
      if (subcommand === 'genesis' && args[3] === 'load') {
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
    init                  Create ~/.nexeth/config.yaml
    doctor                Health check (API, chains, relayer)
    bridge demo           Run deposit → mint demo
    bridge messages       List bridge messages
    portal open           Open operator portal
    update check          Check for client updates (M3)
    node genesis load     Load genesis into Chain B (M2)

  Options:
    --json                JSON output for CI/portal integration

  Quick start:
    npm run bridgenet     Start API + relayer + portal
    npm run demo:bridge   Run end-to-end demo
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
