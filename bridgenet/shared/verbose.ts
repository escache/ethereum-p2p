import { formatEth, formatGwei, formatTimestamp } from './format';
import type { TxReceipt } from './tx-types';
import type { BridgeMessage } from './types';

const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

export function logClientBanner(name: string, address: string, chain: string): void {
  console.log(`
${BOLD}nexeth client${RESET} — ${name}
${DIM}────────────────────────────────────────────────────────${RESET}
  Chain:   ${chain}
  Address: ${address}
${DIM}────────────────────────────────────────────────────────${RESET}`);
}

export function logGethInfo(tag: string, msg: string): void {
  console.log(`${DIM}INFO ${RESET}[${tag}] ${msg}`);
}

export function logGethBlock(chain: string, number: number, hash: string, txCount: number): void {
  console.log(`
${CYAN}Imported new chain segment${RESET}               chain=${chain}
  block=${number}  hash=${hash.slice(0, 18)}…  txs=${txCount}`);
}

export function logTxReceipt(receipt: TxReceipt): void {
  const statusColor = receipt.status === 'success' ? GREEN : '\x1b[31m';
  console.log(`
${BOLD}Transaction receipt${RESET}
${DIM}────────────────────────────────────────────────────────${RESET}
  ${BOLD}hash${RESET}          ${receipt.transactionHash}
  ${BOLD}block${RESET}         #${receipt.blockNumber} (${receipt.blockHash.slice(0, 18)}…)
  ${BOLD}from${RESET}          ${receipt.from}
  ${BOLD}to${RESET}            ${receipt.to}
  ${BOLD}value${RESET}         ${formatEth(BigInt(receipt.value))} ETH (${receipt.value} wei)
  ${BOLD}gas${RESET}           ${receipt.gasUsed} @ ${formatGwei(BigInt(receipt.gasPrice))} gwei
  ${BOLD}nonce${RESET}         ${receipt.nonce}
  ${BOLD}status${RESET}        ${statusColor}${receipt.status}${RESET}
  ${BOLD}chainId${RESET}       ${receipt.chainId}
  ${BOLD}type${RESET}          ${receipt.type}
  ${BOLD}timestamp${RESET}     ${formatTimestamp(receipt.timestamp)}`);

  if (receipt.logs.length > 0) {
    console.log(`\n  ${BOLD}logs (${receipt.logs.length})${RESET}`);
    for (const log of receipt.logs) {
      console.log(`    ${DIM}@${RESET} ${log.address}  topics=[${log.topics[0]?.slice(0, 18)}…]`);
      console.log(`      ${DIM}data:${RESET} ${log.data}`);
    }
  }
  console.log(`${DIM}────────────────────────────────────────────────────────${RESET}`);
}

export function logBridgeMessage(msg: BridgeMessage): void {
  const statusColor =
    msg.status === 'minted' ? GREEN : msg.status === 'failed' ? '\x1b[31m' : YELLOW;

  console.log(`
${BOLD}Bridge transfer${RESET}  ${statusColor}${msg.status.toUpperCase()}${RESET}
${DIM}────────────────────────────────────────────────────────${RESET}
  ${BOLD}messageId${RESET}     ${msg.messageId}
  ${BOLD}sender (A)${RESET}    ${msg.sender}
  ${BOLD}recipient (B)${RESET} ${msg.recipientOnB}
  ${BOLD}amount${RESET}        ${formatEth(msg.amount)} ETH (${msg.amount.toString()} wei)
  ${BOLD}chainA tx${RESET}     ${msg.chainATxHash}
  ${BOLD}chainB tx${RESET}     ${msg.chainBTxHash ?? '(pending)'}
  ${BOLD}created${RESET}       ${formatTimestamp(msg.createdAt)}
  ${BOLD}updated${RESET}       ${formatTimestamp(msg.updatedAt)}`);

  if (msg.chainABlock) {
    console.log(`  ${BOLD}chainA block${RESET}  #${msg.chainABlock.number} ${msg.chainABlock.hash}`);
  }
  if (msg.chainBBlock) {
    console.log(`  ${BOLD}chainB block${RESET}  #${msg.chainBBlock.number} ${msg.chainBBlock.hash}`);
  }
  if (msg.chainAReceipt) logTxReceipt(msg.chainAReceipt);
  if (msg.chainBReceipt) logTxReceipt(msg.chainBReceipt);

  console.log(`\n  ${BOLD}timeline${RESET}`);
  for (const ev of msg.timeline) {
    console.log(`    ${formatTimestamp(ev.at)}  ${ev.status.padEnd(10)} ${ev.detail ?? ''}`);
  }
  console.log(`${DIM}────────────────────────────────────────────────────────${RESET}`);
}

export function logBalanceChange(
  name: string,
  address: string,
  chain: string,
  before: bigint,
  after: bigint
): void {
  const delta = after - before;
  const sign = delta >= 0n ? '+' : '';
  console.log(
    `${GREEN}Balance update${RESET}  ${name} (${address.slice(0, 10)}…) on ${chain}: ` +
      `${formatEth(before)} → ${formatEth(after)} ETH (${sign}${formatEth(delta)})`
  );
}
