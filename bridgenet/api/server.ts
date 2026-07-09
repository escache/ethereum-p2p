import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import type { BridgeRelayer } from '../relayer/relayer';
import type { SimulatedChainA } from '../chain-a/simulated-chain';
import type { AppChainB } from '../chain-b/app-chain';
import type { BridgenetHealth, SecurityModel } from '../shared/types';

export interface ApiServerOptions {
  port: number;
  relayer: BridgeRelayer;
  chainA: SimulatedChainA;
  chainB: AppChainB;
  securityModel: SecurityModel;
  portalDir: string;
}

export function createBridgenetServer(options: ApiServerOptions): http.Server {
  const { port, relayer, chainA, chainB, securityModel, portalDir } = options;
  const clients = new Set<WebSocket>();

  const broadcast = (event: string, data: unknown) => {
    const payload = JSON.stringify({ event, data, at: Date.now() });
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
  };

  relayer.on('message:created', (msg) => broadcast('message:created', serializeMessage(msg)));
  relayer.on('message:updated', (msg) => broadcast('message:updated', serializeMessage(msg)));

  const heartbeat = setInterval(() => {
    broadcast('chain:heartbeat', {
      chainA: chainA.getHealth(),
      chainB: chainB.getHealth(),
      relayerRunning: relayer.isRunning(),
    });
  }, 3000);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const pathname = url.pathname;

    // CORS for local dev
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/api/health') {
      const health: BridgenetHealth = {
        api: true,
        relayer: relayer.isRunning(),
        chains: [chainA.getHealth(), chainB.getHealth()],
        securityModel,
        messageCount: relayer.getMessages().length,
      };
      json(res, health);
      return;
    }

    if (pathname === '/api/chains') {
      json(res, { chainA: chainA.getHealth(), chainB: chainB.getHealth() });
      return;
    }

    if (pathname === '/api/messages' && req.method === 'GET') {
      json(res, relayer.getMessages().map(serializeMessage));
      return;
    }

    const messageMatch = pathname.match(/^\/api\/messages\/(0x[a-fA-F0-9]+)$/);
    if (messageMatch && req.method === 'GET') {
      const msg = relayer.getMessage(messageMatch[1]);
      if (!msg) {
        json(res, { error: 'not found' }, 404);
        return;
      }
      json(res, serializeMessage(msg));
      return;
    }

    if (pathname === '/api/demo/lock' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const sender = parsed.sender ?? '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
          const recipient = parsed.recipient ?? '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
          const amount = BigInt(parsed.amount ?? '1000000000000000000'); // 1 ETH

          chainA.faucet(sender, amount);
          const result = chainA.lock(sender, recipient, amount);
          json(res, {
            ...result,
            amount: amount.toString(),
            sender,
            recipient,
          });
        } catch (err) {
          json(res, { error: err instanceof Error ? err.message : String(err) }, 400);
        }
      });
      return;
    }

    if (pathname === '/api/balance') {
      const address = url.searchParams.get('address');
      const chain = url.searchParams.get('chain') ?? 'b';
      if (!address) {
        json(res, { error: 'address required' }, 400);
        return;
      }
      const balance =
        chain === 'a' ? chainA.getBalance(address) : chainB.getBalance(address);
      json(res, { address, chain, balance: balance.toString() });
      return;
    }

    // Static portal
    serveStatic(req, res, portalDir, pathname);
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
    ws.send(
      JSON.stringify({
        event: 'connected',
        data: { messages: relayer.getMessages().map(serializeMessage) },
        at: Date.now(),
      })
    );
  });

  server.on('close', () => clearInterval(heartbeat));

  server.listen(port, '127.0.0.1', () => {
    console.log(`[api] Bridgenet API + Portal listening on http://127.0.0.1:${port}`);
  });

  return server;
}

function serializeMessage(msg: {
  messageId: string;
  sender: string;
  recipientOnB: string;
  amount: bigint;
  status: string;
  chainATxHash: string;
  chainBTxHash?: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
  timeline: { status: string; at: number; detail?: string }[];
}) {
  return {
    ...msg,
    amount: msg.amount.toString(),
  };
}

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, bigintReplacer));
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function serveStatic(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  portalDir: string,
  pathname: string
): void {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const resolved = path.join(portalDir, filePath);

  if (!resolved.startsWith(portalDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(resolved);
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.svg': 'image/svg+xml',
  };

  res.writeHead(200, { 'Content-Type': types[ext] ?? 'application/octet-stream' });
  fs.createReadStream(resolved).pipe(res);
}
