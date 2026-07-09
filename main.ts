import { StateManager } from './state/state';
import { NetworkManager } from './network/network';
import { PeerManager } from './node/peer_manager';
import { DiscoveryManager } from './node/discovery';

const DISCOVERY_PORT = Number(process.env.DISCOVERY_PORT ?? 30303);
const MAX_PEERS = Number(process.env.MAX_PEERS ?? 25);

async function main(): Promise<void> {
    const stateManager = new StateManager();
    const networkManager = new NetworkManager({ maxPeers: MAX_PEERS });
    const peerManager = new PeerManager(stateManager, networkManager);
    const discoveryManager = new DiscoveryManager({
        discoveryPort: DISCOVERY_PORT,
        networkId: 1,
        bootstrapNodes: []
    });

    console.log('Nexeth P2P node started');
    console.log(`  Discovery port: ${DISCOVERY_PORT}`);
    console.log(`  Max peers:      ${MAX_PEERS}`);
    console.log('Press Ctrl+C to stop.');

    discoveryManager.on('peer:discovered', (peer) => {
        console.log(`Peer discovered: ${peer.id} @ ${peer.host}:${peer.port}`);
    });

    networkManager.on('peer:connected', (peerId) => {
        console.log(`Peer connected: ${peerId}`);
    });

    peerManager.on('peer:managed', (peerId, action) => {
        console.log(`Peer ${peerId} action: ${action}`);
    });

    process.on('SIGINT', () => {
        console.log('\nShutting down Nexeth node...');
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        process.exit(0);
    });
}

main().catch((error) => {
    console.error('Failed to start Nexeth node:', error);
    process.exit(1);
});
