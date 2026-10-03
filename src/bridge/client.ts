import {
  DEFAULT_BRIDGE_PORT,
  type AssetSyncPayload,
  type BridgeStateResponse,
  type Concept,
  type ConceptDecisionPayload,
  type CreateIdeaPayload,
  type ImportedPayload,
  type ReviewDecisionPayload,
} from './protocol';

/** The local AI bridge (`npm run bridge`). Override with VITE_BRIDGE_URL. */
export const BRIDGE_URL = (
  (import.meta.env.VITE_BRIDGE_URL as string | undefined) || `http://127.0.0.1:${DEFAULT_BRIDGE_PORT}`
).replace(/\/$/, '');

export const MCP_URL = `${BRIDGE_URL}/mcp`;

export class BridgeRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, contentType = 'application/json'): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': contentType };
    init.body = body instanceof Blob ? body : JSON.stringify(body);
  }
  const response = await fetch(`${BRIDGE_URL}${path}`, init);
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    throw new BridgeRequestError((data as { error?: string } | null)?.error ?? `Bridge error ${response.status}`, response.status);
  }
  return data as T;
}

const segment = encodeURIComponent;

export const bridgeApi = {
  state: (since?: number) =>
    request<BridgeStateResponse>('GET', since === undefined ? '/api/state' : `/api/state?since=${since}`),
  createIdea: (payload: CreateIdeaPayload) => request<Concept>('POST', '/api/ideas', payload),
  decideConcept: (conceptId: string, payload: ConceptDecisionPayload) =>
    request<Concept>('POST', `/api/concepts/${segment(conceptId)}/decision`, payload),
  markImported: (productionId: string, payload: ImportedPayload) =>
    request('POST', `/api/productions/${segment(productionId)}/imported`, payload),
  syncAsset: (productionId: string, assetId: string, payload: AssetSyncPayload) =>
    request('POST', `/api/productions/${segment(productionId)}/assets/${segment(assetId)}/sync`, payload),
  deliverAsset: (productionId: string, assetId: string, png: Blob, hash: string, version: number) =>
    request(
      'PUT',
      `/api/productions/${segment(productionId)}/assets/${segment(assetId)}/image?hash=${segment(hash)}&version=${version}`,
      png,
      'image/png',
    ),
  deliverComposite: (productionId: string, png: Blob, hash: string) =>
    request('PUT', `/api/productions/${segment(productionId)}/composite?hash=${segment(hash)}`, png, 'image/png'),
  decideReview: (productionId: string, payload: ReviewDecisionPayload) =>
    request('POST', `/api/productions/${segment(productionId)}/review-decision`, payload),
  ackReply: (replyId: string) => request('POST', `/api/replies/${segment(replyId)}/ack`),
};

/** Cache-busted image URLs (the hash changes whenever new artwork is delivered). */
export function assetImageUrl(productionId: string, assetId: string, hash: string): string {
  return `${BRIDGE_URL}/api/productions/${segment(productionId)}/assets/${segment(assetId)}/image?h=${segment(hash)}`;
}

export function compositeImageUrl(productionId: string, hash: string): string {
  return `${BRIDGE_URL}/api/productions/${segment(productionId)}/composite?h=${segment(hash)}`;
}
