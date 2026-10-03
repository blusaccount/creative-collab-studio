import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { BridgeError, type BridgeStore } from './store';
import { createMcpServer } from './mcp';

const JSON_LIMIT = 4 * 1024 * 1024;
const IMAGE_LIMIT = 64 * 1024 * 1024;
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface BridgeServerOptions {
  store: BridgeStore;
  /** Extra browser origins allowed to call the API (the studio on localhost is always allowed). */
  allowedOrigins?: string[];
}

function hostnameOf(host: string): string {
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0];
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOCAL_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(payload);
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new BridgeError(`Request body too large (max ${Math.round(limit / 1024 / 1024)} MB).`, 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req, JSON_LIMIT);
  if (raw.length === 0) return {};
  try {
    const value = JSON.parse(raw.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value as Record<string, unknown>;
  } catch {
    throw new BridgeError('Body must be a JSON object.');
  }
}

type Handler = (ctx: {
  req: IncomingMessage;
  res: ServerResponse;
  params: string[];
  query: URLSearchParams;
}) => Promise<void> | void;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

const SEGMENT = '([^/]+)';

export function createBridgeServer({ store, allowedOrigins = [] }: BridgeServerOptions): Server {
  const extraOrigins = new Set(allowedOrigins);
  const png = (res: ServerResponse, data: Buffer) => {
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store', 'content-length': data.length });
    res.end(data);
  };

  const routes: Route[] = [
    {
      method: 'GET',
      pattern: /^\/api\/health$/,
      handler: ({ res }) => send(res, 200, { ok: true, name: 'creative-collab-bridge', version: store.version }),
    },
    {
      method: 'GET',
      pattern: /^\/api\/state$/,
      handler: ({ res, query }) => {
        const since = Number(query.get('since'));
        if (query.has('since') && since === store.version) {
          send(res, 200, { unchanged: true, version: store.version });
          return;
        }
        send(res, 200, store.snapshot());
      },
    },
    {
      method: 'POST',
      pattern: /^\/api\/ideas$/,
      handler: async ({ req, res }) => {
        const body = await readJson(req);
        send(res, 201, store.createIdea({ title: body.title as string, idea: body.idea as string }));
      },
    },
    {
      method: 'POST',
      pattern: new RegExp(`^/api/concepts/${SEGMENT}/decision$`),
      handler: async ({ req, res, params }) => {
        const body = await readJson(req);
        send(res, 200, store.decideConcept(params[0], body as never));
      },
    },
    {
      method: 'POST',
      pattern: new RegExp(`^/api/productions/${SEGMENT}/imported$`),
      handler: async ({ req, res, params }) => {
        const body = await readJson(req);
        send(res, 200, store.markImported(params[0], body as never));
      },
    },
    {
      method: 'POST',
      pattern: new RegExp(`^/api/productions/${SEGMENT}/assets/${SEGMENT}/sync$`),
      handler: async ({ req, res, params }) => {
        const body = await readJson(req);
        send(res, 200, store.syncAsset(params[0], params[1], body as never));
      },
    },
    {
      method: 'PUT',
      pattern: new RegExp(`^/api/productions/${SEGMENT}/assets/${SEGMENT}/image$`),
      handler: async ({ req, res, params, query }) => {
        const data = await readBody(req, IMAGE_LIMIT);
        const asset = store.deliverAsset(params[0], params[1], data, {
          hash: query.get('hash') ?? '',
          version: Number(query.get('version')) || 0,
        });
        send(res, 200, asset);
      },
    },
    {
      method: 'GET',
      pattern: new RegExp(`^/api/productions/${SEGMENT}/assets/${SEGMENT}/image$`),
      handler: ({ res, params }) => png(res, store.readAsset(params[0], params[1])),
    },
    {
      method: 'PUT',
      pattern: new RegExp(`^/api/productions/${SEGMENT}/composite$`),
      handler: async ({ req, res, params, query }) => {
        const data = await readBody(req, IMAGE_LIMIT);
        store.deliverComposite(params[0], data, query.get('hash') ?? '');
        send(res, 200, { ok: true });
      },
    },
    {
      method: 'GET',
      pattern: new RegExp(`^/api/productions/${SEGMENT}/composite$`),
      handler: ({ res, params }) => png(res, store.readComposite(params[0])),
    },
    {
      method: 'POST',
      pattern: new RegExp(`^/api/productions/${SEGMENT}/review-decision$`),
      handler: async ({ req, res, params }) => {
        const body = await readJson(req);
        send(res, 200, store.decideReview(params[0], body as never));
      },
    },
    {
      method: 'POST',
      pattern: new RegExp(`^/api/replies/${SEGMENT}/ack$`),
      handler: ({ res, params }) => {
        store.ackReply(params[0]);
        send(res, 200, { ok: true });
      },
    },
  ];

  const handleMcp = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      // Stateless server: no standalone SSE stream and no sessions to delete.
      send(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
      return;
    }
    const body = JSON.parse((await readBody(req, JSON_LIMIT)).toString('utf8') || 'null');
    const server = createMcpServer(store);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  };

  return createServer(async (req, res) => {
    try {
      // DNS-rebinding protection: only answer requests addressed to this machine.
      const host = req.headers.host ?? '';
      if (!LOCAL_HOSTNAMES.has(hostnameOf(host))) {
        send(res, 403, { error: 'Forbidden host.' });
        return;
      }
      const origin = req.headers.origin;
      if (origin !== undefined) {
        if (!isLocalOrigin(origin) && !extraOrigins.has(origin)) {
          send(res, 403, { error: 'Forbidden origin.' });
          return;
        }
        res.setHeader('access-control-allow-origin', origin);
        res.setHeader('vary', 'origin');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
          'access-control-allow-headers': 'content-type, mcp-session-id, mcp-protocol-version, accept',
          'access-control-allow-private-network': 'true',
          'access-control-max-age': '600',
        });
        res.end();
        return;
      }

      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/mcp') {
        await handleMcp(req, res);
        return;
      }
      for (const route of routes) {
        if (route.method !== req.method) continue;
        const match = route.pattern.exec(url.pathname);
        if (!match) continue;
        await route.handler({
          req,
          res,
          params: match.slice(1).map((value) => decodeURIComponent(value)),
          query: url.searchParams,
        });
        return;
      }
      send(res, 404, { error: 'Not found.' });
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof BridgeError) {
        send(res, error.status, { error: error.message });
      } else if (error instanceof SyntaxError) {
        send(res, 400, { error: 'Invalid JSON.' });
      } else {
        console.error('[bridge]', error);
        send(res, 500, { error: 'Internal error.' });
      }
    }
  });
}
