/** Anvil/Hardhat default test accounts — labeled for live demos */
export interface LabeledAccount {
  name: string;
  address: string;
  privateKey: string;
  role: 'depositor' | 'recipient' | 'relayer' | 'operator';
}

export const ACCOUNTS: Record<string, LabeledAccount> = {
  alice: {
    name: 'Alice',
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    role: 'depositor',
  },
  bob: {
    name: 'Bob',
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78627d',
    role: 'recipient',
  },
  charlie: {
    name: 'Charlie',
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    role: 'depositor',
  },
  relayer: {
    name: 'Relayer',
    address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    privateKey: '0x47e179ec197488593b187f80d00ebde0e66c9fcece04ba0bf2642f4d49120c3d',
    role: 'relayer',
  },
};

export function resolveAccount(nameOrAddress: string): LabeledAccount | null {
  const key = nameOrAddress.toLowerCase();
  if (ACCOUNTS[key]) return ACCOUNTS[key];
  for (const acct of Object.values(ACCOUNTS)) {
    if (acct.address.toLowerCase() === key) return acct;
  }
  if (nameOrAddress.startsWith('0x') && nameOrAddress.length === 42) {
    return { name: 'Custom', address: nameOrAddress, privateKey: '', role: 'depositor' };
  }
  return null;
}
