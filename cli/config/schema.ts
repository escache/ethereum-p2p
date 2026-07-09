export interface NexethConfig {
  apiUrl: string;
  portalUrl: string;
  chainA: {
    type: 'simulated' | 'anvil' | 'sepolia';
    rpcUrl: string;
  };
  chainB: {
    chainId: number;
    dataDir: string;
  };
  relayer: {
    confirmations: number;
    pollIntervalMs: number;
  };
  securityModel: 'trusted-relayer' | 'multisig' | 'optimistic' | 'light-client';
  json: boolean;
}

export const DEFAULT_CONFIG: NexethConfig = {
  apiUrl: 'http://127.0.0.1:3847',
  portalUrl: 'http://127.0.0.1:3847',
  chainA: {
    type: 'simulated',
    rpcUrl: 'http://127.0.0.1:8545',
  },
  chainB: {
    chainId: 424242,
    dataDir: '~/.nexeth/chain-b',
  },
  relayer: {
    confirmations: 1,
    pollIntervalMs: 500,
  },
  securityModel: 'trusted-relayer',
  json: false,
};

export function configPath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '.';
  return `${home}/.nexeth/config.yaml`;
}
