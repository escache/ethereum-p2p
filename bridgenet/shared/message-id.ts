import { createHash } from 'crypto';

export function computeMessageId(
  chainId: number,
  txHash: string,
  logIndex: number
): string {
  const payload = `${chainId}:${txHash}:${logIndex}`;
  return '0x' + createHash('sha256').update(payload).digest('hex');
}

export function buildTrustedProof(messageId: string, relayerId: string): string {
  return createHash('sha256').update(`${messageId}:${relayerId}:trusted`).digest('hex');
}
