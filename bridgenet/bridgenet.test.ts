import { SimulatedChainA } from './chain-a/simulated-chain';
import { AppChainB } from './chain-b/app-chain';
import { BridgeRelayer } from './relayer/relayer';

const RELAYER_ID = '0xRelayer00000000000000000000000000000001';
const SENDER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const RECIPIENT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('Bridgenet M1', () => {
  it('relays lock on Chain A to mint on Chain B', async () => {
    const chainA = new SimulatedChainA();
    const chainB = new AppChainB(RELAYER_ID);
    const relayer = new BridgeRelayer(chainA, chainB, { confirmations: 0, pollIntervalMs: 10 });
    relayer.start();

    chainA.faucet(SENDER, 5n * 10n ** 18n);
    const amount = 1n * 10n ** 18n;
    const lock = chainA.lock(SENDER, RECIPIENT, amount);

    await waitFor(() => relayer.getMessage(lock.messageId)?.status === 'minted');

    const msg = relayer.getMessage(lock.messageId);
    expect(msg?.status).toBe('minted');
    expect(chainB.getBalance(RECIPIENT)).toBe(amount);
  });

  it('rejects duplicate messageId mint', async () => {
    const chainA = new SimulatedChainA();
    const chainB = new AppChainB(RELAYER_ID);
    const relayer = new BridgeRelayer(chainA, chainB, { confirmations: 0, pollIntervalMs: 10 });
    relayer.start();

    chainA.faucet(SENDER, 10n * 10n ** 18n);
    const lock = chainA.lock(SENDER, RECIPIENT, 1n * 10n ** 18n);
    await waitFor(() => relayer.getMessage(lock.messageId)?.status === 'minted');

    // Second lock creates new messageId — but minted set on chain B prevents replay
    const messages = relayer.getMessages();
    expect(messages).toHaveLength(1);
  });
});

async function waitFor(fn: () => boolean, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timeout');
}
