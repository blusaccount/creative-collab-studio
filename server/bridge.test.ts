import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BridgeStore } from './store';
import { assignStableIds, prepareBlueprint } from './blueprint';
import { createBridgeServer } from './http';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const sceneBlueprint = {
  kind: 'scene',
  name: 'Attic Hideout',
  description: 'A cosy attic',
  artDirection: 'Warm, hand-drawn',
  canvas: { width: 960, height: 540, background: '#111111' },
  assets: [
    { title: 'Old lamp', type: 'prop', dimensions: { width: 128, height: 128 }, background: 'transparent', brief: 'A brass lamp.', layout: { x: 10, y: 10, width: 128, height: 128, layer: 1 } },
    { title: 'Wall poster', type: 'prop', dimensions: { width: 256, height: 128 }, background: 'transparent', brief: 'A faded poster.', layout: { x: 300, y: 40, width: 256, height: 128, layer: 0 } },
  ],
};

let dir: string;
let clock: number;
let store: BridgeStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bridge-test-'));
  clock = 1_000;
  store = new BridgeStore(dir, () => (clock += 10));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Walks a production up to "delivered" the way the studio would. */
function importAndDeliver(productionId: string) {
  const production = store.production(productionId);
  store.markImported(productionId, {
    revision: production.revision,
    projectId: 'project-1',
    sceneId: 'scene-1',
    assets: [
      { assetId: 'asset-old-lamp', title: 'Old lamp', status: 'backlog', version: 1 },
      { assetId: 'asset-wall-poster', title: 'Wall poster', status: 'backlog', version: 1 },
    ],
  });
  for (const assetId of ['asset-old-lamp', 'asset-wall-poster']) {
    store.syncAsset(productionId, assetId, { title: assetId, status: 'complete', version: 1, notes: [] });
    store.deliverAsset(productionId, assetId, PNG, { hash: `h-${assetId}`, version: 1 });
  }
}

function approvedConcept() {
  const concept = store.submitConcept({ title: 'Attic', idea: 'A hideout', draft: 'Warm attic full of junk.' });
  store.decideConcept(concept.id, { decision: 'approved' });
  return concept;
}

describe('stable ids', () => {
  it('derives deterministic, unique ids for the blueprint and its entries', () => {
    const first = prepareBlueprint({ ...sceneBlueprint, assets: [...sceneBlueprint.assets, sceneBlueprint.assets[0]] });
    expect(first.errors).toEqual([]);
    expect(first.blueprint?.id).toBe('scene-attic-hideout');
    expect(first.blueprint?.assets?.map((asset) => asset.id)).toEqual([
      'asset-old-lamp',
      'asset-wall-poster',
      'asset-old-lamp-2',
    ]);
    const again = prepareBlueprint({ ...sceneBlueprint, assets: [...sceneBlueprint.assets, sceneBlueprint.assets[0]] });
    expect(again.blueprint?.assets?.map((asset) => asset.id)).toEqual(first.blueprint?.assets?.map((asset) => asset.id));
  });

  it('keeps valid ids and sanitises unsafe ones', () => {
    const blueprint = assignStableIds({
      id: '../../etc/passwd',
      name: 'Knight',
      description: '',
      artDirection: '',
      kind: 'model',
      maps: [
        { id: 'keep_me.1', map: 'basecolor', part: 'head' },
        { map: 'roughness', part: 'head' },
      ],
    });
    expect(blueprint.id).toBe('etc-passwd');
    expect(blueprint.maps?.map((map) => map.id)).toEqual(['keep_me.1', 'map-head-roughness']);
  });

  it('rejects invalid blueprints with the studio validator', () => {
    expect(prepareBlueprint({ name: 'Empty' }).errors.length).toBeGreaterThan(0);
    expect(prepareBlueprint('{not json').errors[0]).toMatch(/not valid JSON/);
  });
});

describe('concept gate', () => {
  it('runs idea → draft → declined → revision → approved', () => {
    const idea = store.createIdea({ title: 'Attic', idea: 'A cosy hideout in an attic' });
    expect(idea.status).toBe('idea');

    const draft = store.submitConcept({ conceptId: idea.id, draft: 'Draft 1' });
    expect(draft.status).toBe('awaiting-director');
    expect(() => store.submitConcept({ conceptId: idea.id, draft: 'Too early' })).toThrow(/waiting for the director/);
    expect(() => store.decideConcept(idea.id, { decision: 'declined' })).toThrow(/needs feedback/);

    store.decideConcept(idea.id, { decision: 'declined', feedback: 'More dust, fewer toys.' });
    expect(store.concept(idea.id).status).toBe('declined');

    store.submitConcept({ conceptId: idea.id, draft: 'Draft 2: dusty' });
    store.decideConcept(idea.id, { decision: 'approved' });
    const concept = store.concept(idea.id);
    expect(concept.status).toBe('approved');
    expect(concept.revision).toBe(2);
    expect(concept.revisions.map((entry) => entry.decision)).toEqual(['declined', 'approved']);
    expect(store.eventsSince(0).map((event) => event.type)).toEqual([
      'idea-created',
      'concept-submitted',
      'concept-declined',
      'concept-submitted',
      'concept-approved',
    ]);
  });
});

describe('production loop', () => {
  it('only creates tickets for approved concepts', () => {
    const concept = store.submitConcept({ title: 'Attic', draft: 'Draft' });
    expect(() => store.submitProduction({ conceptId: concept.id, blueprint: sceneBlueprint })).toThrow(/must approve/);
  });

  it('tracks delivery, review, rework and acceptance', () => {
    const concept = approvedConcept();
    const production = store.submitProduction({ conceptId: concept.id, blueprint: sceneBlueprint });
    expect(production.phase).toBe('awaiting-import');
    expect(() => store.submitForReview(production.id, 'Too early')).toThrow(/Not everything is delivered/);

    importAndDeliver(production.id);
    expect(store.production(production.id).phase).toBe('delivered');
    expect(store.eventsSince(0).filter((event) => event.type === 'production-delivered')).toHaveLength(1);

    store.submitForReview(production.id, 'Two props, as briefed.');
    expect(store.production(production.id).phase).toBe('in-review');

    store.decideReview(production.id, {
      decision: 'declined',
      feedback: 'Lamp is too modern.',
      rework: [{ assetId: 'asset-old-lamp', note: 'Make it an oil lamp.' }],
    });
    expect(store.production(production.id).phase).toBe('changes-requested');

    // The studio reopens the ticket; nothing is "delivered" until the artist redelivers.
    store.syncAsset(production.id, 'asset-old-lamp', { title: 'Old lamp', status: 'in-progress', version: 1, notes: [] });
    expect(store.production(production.id).phase).toBe('changes-requested');
    store.syncAsset(production.id, 'asset-old-lamp', { title: 'Old lamp', status: 'complete', version: 2, notes: [] });
    expect(store.production(production.id).phase).toBe('changes-requested');
    store.deliverAsset(production.id, 'asset-old-lamp', PNG, { hash: 'h2', version: 2 });
    expect(store.production(production.id).phase).toBe('delivered');

    store.submitForReview(production.id, 'Oil lamp now.');
    store.decideReview(production.id, { decision: 'accepted' });
    expect(store.production(production.id).phase).toBe('accepted');
    expect(store.production(production.id).reviews.map((round) => round.decision)).toEqual(['declined', 'accepted']);
  });

  it('reports artist notes but not the AI or director notes echoed back', () => {
    const concept = approvedConcept();
    const production = store.submitProduction({ conceptId: concept.id, blueprint: sceneBlueprint });
    importAndDeliver(production.id);
    const since = store.seq;
    store.syncAsset(production.id, 'asset-old-lamp', {
      title: 'Old lamp',
      status: 'complete',
      version: 1,
      notes: [
        { id: 'note-1', body: 'Brass or copper?', author: 'Artist', createdAt: 1 },
        { id: 'note-ai-1', body: 'Brass.', author: 'AI', createdAt: 2 },
        { id: 'note-director-1', body: 'Older.', author: 'Director', createdAt: 3 },
      ],
    });
    const events = store.eventsSince(since);
    expect(events.map((event) => event.type)).toEqual(['artist-note']);
    expect(events[0].message).toContain('Brass or copper?');
  });

  it('queues AI replies until the studio acknowledges them', () => {
    const concept = approvedConcept();
    const production = store.submitProduction({ conceptId: concept.id, blueprint: sceneBlueprint });
    expect(() => store.replyToArtist(production.id, 'asset-old-lamp', 'Brass.')).toThrow();
    importAndDeliver(production.id);
    const reply = store.replyToArtist(production.id, 'asset-old-lamp', 'Brass.');
    expect(reply.id.startsWith('note-ai')).toBe(true);
    expect(store.snapshot().replies).toHaveLength(1);
    store.ackReply(reply.id);
    expect(store.snapshot().replies).toHaveLength(0);
  });

  it('revising a production sends it back to the studio and keeps delivered work', () => {
    const concept = approvedConcept();
    const production = store.submitProduction({ conceptId: concept.id, blueprint: sceneBlueprint });
    importAndDeliver(production.id);
    const revised = store.submitProduction({
      conceptId: concept.id,
      blueprint: { ...sceneBlueprint, artDirection: 'Colder light' },
    });
    expect(revised.id).toBe(production.id);
    expect(revised.revision).toBe(2);
    expect(revised.phase).toBe('awaiting-import');
    expect(store.asset(production.id, 'asset-old-lamp').delivered?.hash).toBe('h-asset-old-lamp');
  });

  it('persists state and artwork across restarts', () => {
    const concept = approvedConcept();
    const production = store.submitProduction({ conceptId: concept.id, blueprint: sceneBlueprint });
    importAndDeliver(production.id);
    const reopened = new BridgeStore(dir);
    expect(reopened.production(production.id).phase).toBe('delivered');
    expect(reopened.readAsset(production.id, 'asset-old-lamp').equals(PNG)).toBe(true);
    expect(reopened.seq).toBe(store.seq);
  });

  it('rejects non-PNG deliveries', () => {
    const concept = approvedConcept();
    const production = store.submitProduction({ conceptId: concept.id, blueprint: sceneBlueprint });
    importAndDeliver(production.id);
    expect(() => store.deliverAsset(production.id, 'asset-old-lamp', Buffer.from('nope'), { hash: 'x', version: 1 })).toThrow(/PNG/);
  });
});

describe('waiting for events', () => {
  it('wakes on a matching event and times out quietly', async () => {
    const since = store.seq;
    const waiting = store.waitForEvents(since, {}, 5_000);
    store.createIdea({ title: 'Idea', idea: 'Something' });
    const events = await waiting;
    expect(events.map((event) => event.type)).toEqual(['idea-created']);
    expect(await store.waitForEvents(store.seq, {}, 20)).toEqual([]);
  });

  it('ignores events of other concepts', async () => {
    const a = store.createIdea({ title: 'A', idea: 'a' });
    const waiting = store.waitForEvents(store.seq, { conceptId: a.id }, 5_000);
    store.createIdea({ title: 'B', idea: 'b' });
    store.submitConcept({ conceptId: a.id, draft: 'A draft' });
    const events = await waiting;
    expect(events.map((event) => event.conceptId)).toEqual([a.id]);
  });

  it('stops waiting when aborted', async () => {
    const controller = new AbortController();
    const waiting = store.waitForEvents(store.seq, {}, 60_000, controller.signal);
    controller.abort();
    expect(await waiting).toEqual([]);
  });
});

describe('HTTP bridge', () => {
  let server: Server;
  let base: string;

  beforeEach(async () => {
    server = createBridgeServer({ store });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('refuses foreign origins and hosts', async () => {
    const foreign = await fetch(`${base}/api/state`, { headers: { origin: 'https://evil.example' } });
    expect(foreign.status).toBe(403);
    const local = await fetch(`${base}/api/state`, { headers: { origin: 'http://localhost:3000' } });
    expect(local.status).toBe(200);
    expect(local.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('short-circuits unchanged state polls', async () => {
    const first = (await (await fetch(`${base}/api/state`)).json()) as { version: number };
    const second = await (await fetch(`${base}/api/state?since=${first.version}`)).json();
    expect(second).toEqual({ unchanged: true, version: first.version });
  });

  it('maps rule violations to 4xx', async () => {
    const response = await fetch(`${base}/api/concepts/nope/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'approved' }),
    });
    expect(response.status).toBe(404);
  });

  it('serves the MCP tools and wakes a waiting agent on the director decision', async () => {
    const client = new Client({ name: 'test-agent', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));

    const tools = (await client.listTools()).tools.map((tool) => tool.name).sort();
    expect(tools).toEqual([
      'get_asset_image',
      'get_blueprint_format',
      'get_concept',
      'get_production',
      'get_scene_composite',
      'message_artist',
      'studio_status',
      'submit_concept',
      'submit_for_review',
      'submit_production',
      'wait_for_updates',
    ]);

    const submitted = await client.callTool({
      name: 'submit_concept',
      arguments: { title: 'Attic', draft: 'A warm, dusty attic.' },
    });
    expect(submitted.isError).toBeFalsy();
    const conceptId = store.snapshot().concepts[0].id;

    const early = await client.callTool({
      name: 'submit_production',
      arguments: { conceptId, blueprint: sceneBlueprint },
    });
    expect(early.isError).toBe(true);

    const cursor = store.seq;
    const waiting = client.callTool({
      name: 'wait_for_updates',
      arguments: { cursor, conceptId, timeoutSeconds: 10 },
    });
    // The director approves in the studio.
    const decision = await fetch(`${base}/api/concepts/${conceptId}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approved', feedback: 'Go.' }),
    });
    expect(decision.status).toBe(200);
    const woke = await waiting;
    const text = (woke.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('concept-approved');

    const production = await client.callTool({
      name: 'submit_production',
      arguments: { conceptId, blueprint: sceneBlueprint },
    });
    expect(production.isError).toBeFalsy();
    importAndDeliver('scene-attic-hideout');

    const image = await client.callTool({
      name: 'get_asset_image',
      arguments: { productionId: 'scene-attic-hideout', assetId: 'asset-old-lamp' },
    });
    const parts = image.content as { type: string; data?: string; mimeType?: string }[];
    expect(parts[1]).toMatchObject({ type: 'image', mimeType: 'image/png', data: PNG.toString('base64') });

    await client.close();
  });

  it('accepts artwork uploads from the studio', async () => {
    const concept = approvedConcept();
    const production = store.submitProduction({ conceptId: concept.id, blueprint: sceneBlueprint });
    store.markImported(production.id, {
      revision: 1,
      projectId: 'p',
      sceneId: 's',
      assets: [{ assetId: 'asset-old-lamp', title: 'Old lamp', status: 'complete', version: 1 }],
    });
    const upload = await fetch(`${base}/api/productions/${production.id}/assets/asset-old-lamp/image?hash=abc&version=3`, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: PNG,
    });
    expect(upload.status).toBe(200);
    expect(store.asset(production.id, 'asset-old-lamp').delivered).toMatchObject({ hash: 'abc', version: 3 });
    const download = await fetch(`${base}/api/productions/${production.id}/assets/asset-old-lamp/image`);
    expect(Buffer.from(await download.arrayBuffer()).equals(PNG)).toBe(true);
  });
});
