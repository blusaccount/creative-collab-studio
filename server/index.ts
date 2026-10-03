import { resolve } from 'node:path';
import { DEFAULT_BRIDGE_PORT } from '../src/bridge/protocol';
import { BridgeStore } from './store';
import { createBridgeServer } from './http';

const port = Number(process.env.STUDIO_BRIDGE_PORT) || DEFAULT_BRIDGE_PORT;
const host = process.env.STUDIO_BRIDGE_HOST || '127.0.0.1';
const dataDir = resolve(process.env.STUDIO_BRIDGE_DATA || '.studio-bridge');
const allowedOrigins = (process.env.STUDIO_BRIDGE_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const store = new BridgeStore(dataDir);
const server = createBridgeServer({ store, allowedOrigins });

server.listen(port, host, () => {
  const base = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
  console.log(`Creative Collab Studio — AI bridge
  Studio API   ${base}/api
  MCP endpoint ${base}/mcp
  Data         ${dataDir}

Connect an agent, e.g. Claude Code:
  claude mcp add --transport http creative-collab ${base}/mcp`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
  // Long-polling agents would otherwise keep the process alive.
  server.closeAllConnections();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
