import type { Note, Project, Scene, Ticket } from '../types';
import type { AiReply, AssetRecord, BridgeSnapshot, NoteRecord, Production } from './protocol';

// Pure planning for the studio ↔ bridge sync. useBridge executes the plans;
// keeping the decisions here makes them testable without a browser.

/** The studio scene a production was imported as (if it still exists). */
export function findStudioScene(production: Production, scenes: Scene[]): Scene | undefined {
  const candidates = scenes.filter((scene) => scene.blueprintId === production.id);
  return (
    candidates.find((scene) => scene.id === production.studio?.sceneId) ??
    candidates.find((scene) => scene.projectId === production.studio?.projectId) ??
    candidates[0]
  );
}

/** The tickets currently placed in a scene, in slot order, that carry a blueprint asset id. */
export function sceneRoster(scene: Scene, tickets: Ticket[]): Ticket[] {
  const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  return scene.items
    .map((item) => byId.get(item.ticketId))
    .filter((ticket): ticket is Ticket => Boolean(ticket?.blueprintAssetId));
}

/** Identifies one revision of a production (used to skip revisions that failed to import). */
export function importKey(production: Production): string {
  return `${production.id}@${production.revision}`;
}

export interface ImportPlan {
  production: Production;
  projectId: string;
}

/** The next production revision the studio has not turned into tickets yet. */
export function planImport(
  snapshot: BridgeSnapshot,
  scenes: Scene[],
  projects: Project[],
  activeProjectId: string,
  skip: ReadonlySet<string> = new Set(),
): ImportPlan | null {
  const production = snapshot.productions.find(
    (item) => item.importedRevision < item.revision && !skip.has(importKey(item)),
  );
  if (!production) return null;
  const existing = findStudioScene(production, scenes);
  const projectIds = new Set(projects.map((project) => project.id));
  const projectId =
    existing?.projectId ??
    (production.studio && projectIds.has(production.studio.projectId) ? production.studio.projectId : undefined) ??
    (projectIds.has(activeProjectId) ? activeProjectId : projects[0]?.id);
  return projectId ? { production, projectId } : null;
}

export interface ReplyPlan {
  reply: AiReply;
  /** null = the ticket is gone; the reply can be dropped. */
  ticket: Ticket | null;
}

/** The next AI reply that can be shown on its ticket. Replies for productions not in the studio wait. */
export function planReply(snapshot: BridgeSnapshot, scenes: Scene[], tickets: Ticket[]): ReplyPlan | null {
  for (const reply of snapshot.replies) {
    const production = snapshot.productions.find((item) => item.id === reply.productionId);
    if (!production) return { reply, ticket: null };
    const scene = findStudioScene(production, scenes);
    if (!scene) continue;
    const ticket = sceneRoster(scene, tickets).find((item) => item.blueprintAssetId === reply.assetId) ?? null;
    return { reply, ticket };
  }
  return null;
}

export function toNoteRecords(notes: Note[]): NoteRecord[] {
  return notes.map(({ id, body, author, createdAt }) => ({ id, body, author, createdAt }));
}

function sameNotes(record: AssetRecord, ticket: Ticket): boolean {
  return (
    record.notes.length === ticket.notes.length &&
    record.notes.every((note, index) => note.id === ticket.notes[index].id && note.body === ticket.notes[index].body)
  );
}

/** Statuses where the artist has something to show; the artwork is uploaded for the AI. */
const DELIVERABLE = new Set<Ticket['status']>(['review-ready', 'complete']);

export type OutboxAction =
  | { kind: 'sync'; production: Production; ticket: Ticket; assetId: string }
  | { kind: 'deliver'; production: Production; ticket: Ticket; assetId: string; hash: string }
  | { kind: 'composite'; production: Production; scene: Scene; roster: Ticket[]; hash: string };

/**
 * Everything the studio needs to tell the bridge: status/notes changes,
 * newly finished artwork and the assembled scene. `hashOf` returns a content
 * hash of a ticket's artwork.
 */
export function planOutbox(
  snapshot: BridgeSnapshot,
  scenes: Scene[],
  tickets: Ticket[],
  hashOf: (ticket: Ticket) => string,
): OutboxAction[] {
  const actions: OutboxAction[] = [];
  for (const production of snapshot.productions) {
    if (production.importedRevision === 0) continue;
    const scene = findStudioScene(production, scenes);
    if (!scene) continue;
    const roster = sceneRoster(scene, tickets);
    const records = new Map(production.assets.map((asset) => [asset.assetId, asset]));

    for (const ticket of roster) {
      const assetId = ticket.blueprintAssetId!;
      const record = records.get(assetId);
      if (!record) continue;
      if (
        record.status !== ticket.status ||
        record.title !== ticket.title ||
        record.version !== ticket.version ||
        !sameNotes(record, ticket)
      ) {
        actions.push({ kind: 'sync', production, ticket, assetId });
      }
      if (DELIVERABLE.has(ticket.status)) {
        const hash = hashOf(ticket);
        if (record.delivered?.hash !== hash) actions.push({ kind: 'deliver', production, ticket, assetId, hash });
      }
    }

    if (scene.kind === 'scene' && roster.length > 0 && roster.every((ticket) => ticket.status === 'complete')) {
      const layout = scene.items.map((item) => `${item.ticketId}@${item.x},${item.y},${item.width},${item.height},${item.layer}`);
      const hash = combineHashes([...roster.map(hashOf), ...layout, scene.canvas.background]);
      if (production.composite?.hash !== hash) actions.push({ kind: 'composite', production, scene, roster, hash });
    }
  }
  return actions;
}

export function combineHashes(parts: string[]): string {
  let hash = 0;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash = (Math.imul(31, hash) + part.charCodeAt(index)) | 0;
    }
    hash = (Math.imul(31, hash) + 124) | 0;
  }
  return (hash >>> 0).toString(36);
}

/** What changed between two snapshots that the people in the studio should hear about. */
export interface BridgeNews {
  conceptsToDecide: string[];
  reviewsToDecide: string[];
}

export function diffNews(previous: BridgeSnapshot, next: BridgeSnapshot): BridgeNews {
  const before = new Map(previous.concepts.map((concept) => [concept.id, concept]));
  const beforeProductions = new Map(previous.productions.map((production) => [production.id, production]));
  return {
    conceptsToDecide: next.concepts
      .filter((concept) => {
        const old = before.get(concept.id);
        return concept.status === 'awaiting-director' && (!old || old.revision !== concept.revision);
      })
      .map((concept) => concept.title),
    reviewsToDecide: next.productions
      .filter((production) => {
        const old = beforeProductions.get(production.id);
        return production.phase === 'in-review' && old?.phase !== 'in-review';
      })
      .map((production) => production.name),
  };
}

/** How many decisions are waiting on the director. */
export function pendingDecisions(snapshot: BridgeSnapshot | null): number {
  if (!snapshot) return 0;
  return (
    snapshot.concepts.filter((concept) => concept.status === 'awaiting-director').length +
    snapshot.productions.filter((production) => production.phase === 'in-review').length
  );
}
