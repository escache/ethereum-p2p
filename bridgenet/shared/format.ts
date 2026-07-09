export function formatEth(wei: bigint, decimals = 6): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, decimals);
  return `${whole}.${frac}`;
}

export function formatGwei(wei: bigint): string {
  return (wei / 10n ** 9n).toString();
}

export function formatTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', ' UTC');
}

export function shortAddr(addr: string, chars = 8): string {
  if (addr.length <= chars * 2 + 2) return addr;
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}
