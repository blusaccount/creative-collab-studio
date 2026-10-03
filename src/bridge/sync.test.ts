import { describe, expect, it } from 'vitest';
import type { Project, Scene, Ticket } from '../types';
import type { BridgeSnapshot, Production } from './protocol';
import { diffNews, pendingDecisions, planImport, planOutbox, planReply, sceneRoster } from './sync';

const project: Project = {
  id: 'project-1',
  name: 'Game',
  assetOutputFolder: 'out',
  defaultDimensions: { width: 512, height: 512 },
  createdAt: 0,
  updatedAt: 0,
};

function ticket(id: string, assetId: string | undefined, patch: Partial<Ticket> = {}): Ticket {
  return {
    id,
    projectId: project.id,
    sceneId: 'scene-1',
    blueprintAssetId: assetId,
    title: assetId ?? id,
    description: '',
    type: 'prop',
    status: 'backlog',
    dimensions: { width: 64, height: 64 },
    order: 0,
    notes: [],
    layers: [],
    background: 'transparent',
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

const scene: Scene = {
  id: 'scene-1',
  projectId: project.id,
  blueprintId: 'scene-attic',
  kind: 'scene',
  name: 'Attic',
  description: '',
  artDirection: '',
  canvas: { width: 960, height: 540, background: '#000' },
  items: [
    { id: 'i1', ticketId: 't1', label: 'Lamp', x: 0, y: 0, width: 64, height: 64, layer: 0 },
    { id: 'i2', ticketId: 't2', label: 'Poster', x: 70, y: 0, width: 64, height: 64, layer: 1 },
  ],
  createdAt: 0,
  updatedAt: 0,
};

function production(patch: Partial<Production> = {}): Production {
  return {
    id: 'scene-attic',
    conceptId: 'concept-1',
    name: 'Attic',
    kind: 'scene',
    revision: 1,
    blueprint: { id: 'scene-attic', name: 'Attic', description: '', artDirection: '', assets: [] },
    warnings: [],
    importedRevision: 1,
    studio: { projectId: project.id, sceneId: scene.id },
    phase: 'in-production',
    assets: [
      { assetId: 'asset-lamp', title: 'asset-lamp', status: 'backlog', version: 1, notes: [], updatedAt: 0 },
      { assetId: 'asset-poster', title: 'asset-poster', status: 'backlog', version: 1, notes: [], updatedAt: 0 },
    ],
    reviews: [],
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

function snapshot(patch: Partial<BridgeSnapshot> = {}): BridgeSnapshot {
  return { version: 1, seq: 1, concepts: [], productions: [production()], replies: [], ...patch };
}

const hashOf = (item: Ticket) => `hash-${item.id}-${item.version}`;

describe('bridge sync planning', () => {
  it('imports new revisions into the project that already holds the scene', () => {
    const plan = planImport(
      snapshot({ productions: [production({ revision: 2, importedRevision: 1 })] }),
      [scene],
      [project, { ...project, id: 'project-2' }],
      'project-2',
    );
    expect(plan?.projectId).toBe('project-1');
  });

  it('imports brand-new productions into the active project', () => {
    const plan = planImport(
      snapshot({ productions: [production({ importedRevision: 0, studio: undefined })] }),
      [],
      [project, { ...project, id: 'project-2' }],
      'project-2',
    );
    expect(plan?.projectId).toBe('project-2');
    expect(planImport(snapshot(), [scene], [project], project.id)).toBeNull();
  });

  it('skips revisions that already failed to import', () => {
    const broken = production({ id: 'broken', importedRevision: 0 });
    const next = production({ id: 'next', importedRevision: 0 });
    const plan = planImport(snapshot({ productions: [broken, next] }), [], [project], project.id, new Set(['broken@1']));
    expect(plan?.production.id).toBe('next');
  });

  it('only counts tickets placed in the scene as its roster', () => {
    const stale = ticket('t-old', 'asset-removed');
    expect(sceneRoster(scene, [ticket('t2', 'asset-poster'), stale, ticket('t1', 'asset-lamp')]).map((item) => item.id)).toEqual([
      't1',
      't2',
    ]);
  });

  it('pushes status changes and delivers finished artwork once', () => {
    const tickets = [ticket('t1', 'asset-lamp', { status: 'complete' }), ticket('t2', 'asset-poster')];
    const actions = planOutbox(snapshot(), [scene], tickets, hashOf);
    expect(actions.map((action) => `${action.kind}:${'assetId' in action ? action.assetId : ''}`)).toEqual([
      'sync:asset-lamp',
      'deliver:asset-lamp',
    ]);

    const delivered = production({
      assets: [
        {
          assetId: 'asset-lamp',
          title: 'asset-lamp',
          status: 'complete',
          version: 1,
          notes: [],
          delivered: { hash: 'hash-t1-1', version: 1, deliveredAt: 1, bytes: 1 },
          updatedAt: 0,
        },
        production().assets[1],
      ],
    });
    expect(planOutbox(snapshot({ productions: [delivered] }), [scene], tickets, hashOf)).toEqual([]);
  });

  it('pushes new notes and renders the composite when every slot is complete', () => {
    const note = { id: 'note-1', body: 'Brass?', author: 'Artist', createdAt: 1 };
    const tickets = [
      ticket('t1', 'asset-lamp', { status: 'complete', notes: [note] }),
      ticket('t2', 'asset-poster', { status: 'complete' }),
    ];
    const kinds = planOutbox(snapshot(), [scene], tickets, hashOf).map((action) => action.kind);
    expect(kinds.filter((kind) => kind === 'sync')).toHaveLength(2);
    expect(kinds.filter((kind) => kind === 'deliver')).toHaveLength(2);
    expect(kinds[kinds.length - 1]).toBe('composite');
  });

  it('skips productions whose scene is gone or not imported yet', () => {
    const tickets = [ticket('t1', 'asset-lamp', { status: 'complete' })];
    expect(planOutbox(snapshot(), [], tickets, hashOf)).toEqual([]);
    expect(planOutbox(snapshot({ productions: [production({ importedRevision: 0 })] }), [scene], tickets, hashOf)).toEqual([]);
  });

  it('routes AI replies to their ticket and drops replies for unknown productions', () => {
    const reply = { id: 'note-ai-1', productionId: 'scene-attic', assetId: 'asset-poster', body: 'Faded.', createdAt: 1 };
    const tickets = [ticket('t1', 'asset-lamp'), ticket('t2', 'asset-poster')];
    expect(planReply(snapshot({ replies: [reply] }), [scene], tickets)?.ticket?.id).toBe('t2');
    expect(planReply(snapshot({ replies: [{ ...reply, productionId: 'gone' }] }), [scene], tickets)?.ticket).toBeNull();
    expect(planReply(snapshot({ replies: [reply] }), [], tickets)).toBeNull();
  });

  it('announces new concept revisions and new reviews', () => {
    const concept = {
      id: 'c1',
      title: 'Attic',
      idea: '',
      status: 'awaiting-director' as const,
      revision: 1,
      draft: 'd',
      revisions: [],
      createdBy: 'ai' as const,
      createdAt: 0,
      updatedAt: 0,
    };
    const before = snapshot();
    const after = snapshot({ concepts: [concept], productions: [production({ phase: 'in-review' })] });
    expect(diffNews(before, after)).toEqual({ conceptsToDecide: ['Attic'], reviewsToDecide: ['Attic'] });
    expect(diffNews(after, after)).toEqual({ conceptsToDecide: [], reviewsToDecide: [] });
    expect(pendingDecisions(after)).toBe(2);
  });
});
