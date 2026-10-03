import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { TicketStatus } from '../src/types';
import {
  AI_NOTE_PREFIX,
  DIRECTOR_NOTE_PREFIX,
  requiredAssets,
  type AiReply,
  type AssetRecord,
  type AssetSyncPayload,
  type BridgeEvent,
  type BridgeEventType,
  type BridgeSnapshot,
  type Concept,
  type ConceptDecisionPayload,
  type CreateIdeaPayload,
  type ImportedPayload,
  type Production,
  type ReviewDecisionPayload,
} from '../src/bridge/protocol';
import { isSafeId, prepareBlueprint } from './blueprint';

const STATUSES: TicketStatus[] = ['backlog', 'in-progress', 'review-ready', 'complete', 'archived'];
const MAX_EVENTS = 1000;
const MAX_TEXT = 20_000;

/** A rule violation the caller can fix; maps to HTTP 4xx / an MCP tool error. */
export class BridgeError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

interface PersistedState {
  formatVersion: 1;
  version: number;
  seq: number;
  concepts: Concept[];
  productions: Production[];
  replies: AiReply[];
  events: BridgeEvent[];
}

export interface EventFilter {
  conceptId?: string;
  productionId?: string;
}

interface Waiter {
  since: number;
  filter: EventFilter;
  resolve: (events: BridgeEvent[]) => void;
}

function newId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function text(value: unknown, field: string, { required = false, max = MAX_TEXT } = {}): string {
  if (value === undefined || value === null) {
    if (required) throw new BridgeError(`"${field}" is required.`);
    return '';
  }
  if (typeof value !== 'string') throw new BridgeError(`"${field}" must be a string.`);
  const trimmed = value.trim();
  if (required && !trimmed) throw new BridgeError(`"${field}" must not be empty.`);
  if (trimmed.length > max) throw new BridgeError(`"${field}" is too long (max ${max} characters).`);
  return trimmed;
}

function status(value: unknown): TicketStatus {
  if (!STATUSES.includes(value as TicketStatus)) throw new BridgeError(`Unknown ticket status "${String(value)}".`);
  return value as TicketStatus;
}

function matches(event: BridgeEvent, filter: EventFilter): boolean {
  if (filter.conceptId && event.conceptId !== filter.conceptId) return false;
  if (filter.productionId && event.productionId !== filter.productionId) return false;
  return true;
}

/**
 * The bridge's single source of truth: the AI-facing side of the loop.
 * The studio (browser) owns tickets and artwork; this store tracks what the AI
 * asked for, what the director decided and what the artist delivered.
 */
export class BridgeStore {
  private state: PersistedState;
  private waiters = new Set<Waiter>();
  private readonly statePath: string;
  readonly assetDir: string;

  constructor(
    readonly dataDir: string,
    private readonly now: () => number = Date.now,
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.statePath = join(dataDir, 'state.json');
    this.assetDir = join(dataDir, 'assets');
    mkdirSync(this.assetDir, { recursive: true });
    this.state = this.load();
  }

  private load(): PersistedState {
    if (existsSync(this.statePath)) {
      const raw = JSON.parse(readFileSync(this.statePath, 'utf8')) as PersistedState;
      if (raw.formatVersion === 1) return raw;
    }
    return { formatVersion: 1, version: 0, seq: 0, concepts: [], productions: [], replies: [], events: [] };
  }

  private save(): void {
    this.state.version += 1;
    const tmp = `${this.statePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.statePath);
  }

  private emit(type: BridgeEventType, message: string, refs: Omit<BridgeEvent, 'seq' | 'at' | 'type' | 'message'>): void {
    this.state.seq += 1;
    const event: BridgeEvent = { seq: this.state.seq, at: this.now(), type, message, ...refs };
    this.state.events.push(event);
    if (this.state.events.length > MAX_EVENTS) this.state.events.splice(0, this.state.events.length - MAX_EVENTS);
  }

  /** Persists and wakes everyone waiting for events. */
  private commit(): void {
    this.save();
    for (const waiter of [...this.waiters]) {
      const events = this.eventsSince(waiter.since, waiter.filter);
      if (events.length > 0) {
        this.waiters.delete(waiter);
        waiter.resolve(events);
      }
    }
  }

  // ---- reads -------------------------------------------------------------------

  get version(): number {
    return this.state.version;
  }

  get seq(): number {
    return this.state.seq;
  }

  snapshot(): BridgeSnapshot {
    return {
      version: this.state.version,
      seq: this.state.seq,
      concepts: this.state.concepts,
      productions: this.state.productions,
      replies: this.state.replies,
    };
  }

  concept(id: string): Concept {
    const concept = this.state.concepts.find((item) => item.id === id);
    if (!concept) throw new BridgeError(`Unknown concept "${id}".`, 404);
    return concept;
  }

  production(id: string): Production {
    const production = this.state.productions.find((item) => item.id === id);
    if (!production) throw new BridgeError(`Unknown production "${id}".`, 404);
    return production;
  }

  asset(productionId: string, assetId: string): AssetRecord {
    const asset = this.production(productionId).assets.find((item) => item.assetId === assetId);
    if (!asset) throw new BridgeError(`Production "${productionId}" has no asset "${assetId}".`, 404);
    return asset;
  }

  eventsSince(since: number, filter: EventFilter = {}): BridgeEvent[] {
    return this.state.events.filter((event) => event.seq > since && matches(event, filter));
  }

  /** Resolves with the next matching events after `since`, or [] on timeout/abort. */
  waitForEvents(since: number, filter: EventFilter, timeoutMs: number, signal?: AbortSignal): Promise<BridgeEvent[]> {
    const ready = this.eventsSince(since, filter);
    if (ready.length > 0 || timeoutMs <= 0 || signal?.aborted) return Promise.resolve(ready);
    return new Promise((resolve) => {
      const finish = (events: BridgeEvent[]) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        this.waiters.delete(waiter);
        resolve(events);
      };
      const waiter: Waiter = { since, filter, resolve: finish };
      const onAbort = () => finish([]);
      const timer = setTimeout(() => finish([]), timeoutMs);
      signal?.addEventListener('abort', onAbort);
      this.waiters.add(waiter);
    });
  }

  // ---- concept gate (director ↔ AI) -------------------------------------------

  /** Director: write down an idea for the AI to draft (loop step 1). */
  createIdea(payload: CreateIdeaPayload): Concept {
    const now = this.now();
    const concept: Concept = {
      id: newId('concept'),
      title: text(payload.title, 'title', { required: true, max: 200 }),
      idea: text(payload.idea, 'idea', { required: true }),
      status: 'idea',
      revision: 0,
      draft: '',
      revisions: [],
      createdBy: 'director',
      createdAt: now,
      updatedAt: now,
    };
    this.state.concepts.push(concept);
    this.emit('idea-created', `The director wrote a new idea: "${concept.title}".`, { conceptId: concept.id });
    this.commit();
    return concept;
  }

  /** AI: present a concept draft (new, or a revision of an existing concept) to the director (loop step 2). */
  submitConcept(input: { conceptId?: string; title?: string; idea?: string; draft: string }): Concept {
    const draft = text(input.draft, 'draft', { required: true });
    const now = this.now();
    let concept: Concept;
    if (input.conceptId) {
      concept = this.concept(input.conceptId);
      if (concept.status === 'awaiting-director') {
        throw new BridgeError(
          `Concept "${concept.id}" is still waiting for the director's decision on revision ${concept.revision}.`,
          409,
        );
      }
      if (input.title) concept.title = text(input.title, 'title', { max: 200 });
      if (input.idea && concept.createdBy === 'ai') concept.idea = text(input.idea, 'idea');
    } else {
      concept = {
        id: newId('concept'),
        title: text(input.title, 'title', { required: true, max: 200 }),
        idea: text(input.idea, 'idea'),
        status: 'idea',
        revision: 0,
        draft: '',
        revisions: [],
        createdBy: 'ai',
        createdAt: now,
        updatedAt: now,
      };
      this.state.concepts.push(concept);
    }
    concept.revision += 1;
    concept.draft = draft;
    concept.status = 'awaiting-director';
    concept.feedback = undefined;
    concept.updatedAt = now;
    concept.revisions.push({ revision: concept.revision, draft, submittedAt: now });
    this.emit('concept-submitted', `Concept "${concept.title}" revision ${concept.revision} is waiting for the director.`, {
      conceptId: concept.id,
    });
    this.commit();
    return concept;
  }

  /** Director: OK or DECLINED on the concept draft. */
  decideConcept(id: string, payload: ConceptDecisionPayload): Concept {
    const concept = this.concept(id);
    if (concept.status !== 'awaiting-director') {
      throw new BridgeError(`Concept "${concept.title}" has no draft waiting for a decision.`, 409);
    }
    if (payload.decision !== 'approved' && payload.decision !== 'declined') {
      throw new BridgeError('"decision" must be "approved" or "declined".');
    }
    const feedback = text(payload.feedback, 'feedback');
    if (payload.decision === 'declined' && !feedback) {
      throw new BridgeError('Declining needs feedback, so the AI knows what to change.');
    }
    const now = this.now();
    concept.status = payload.decision;
    concept.feedback = feedback || undefined;
    concept.updatedAt = now;
    const current = concept.revisions[concept.revisions.length - 1];
    if (current) Object.assign(current, { decision: payload.decision, feedback: feedback || undefined, decidedAt: now });
    this.emit(
      payload.decision === 'approved' ? 'concept-approved' : 'concept-declined',
      payload.decision === 'approved'
        ? `The director approved concept "${concept.title}"${feedback ? `: ${feedback}` : '.'}`
        : `The director declined concept "${concept.title}": ${feedback}`,
      { conceptId: concept.id },
    );
    this.commit();
    return concept;
  }

  // ---- production (AI → studio → artist → AI) ---------------------------------

  /** AI: turn an approved concept into tickets (loop step 3). Re-submitting the same id is a revision. */
  submitProduction(input: { conceptId: string; blueprint: unknown }): Production {
    const concept = this.concept(input.conceptId);
    if (concept.status !== 'approved') {
      throw new BridgeError(
        `Concept "${concept.title}" is "${concept.status}" — the director must approve it before tickets are created.`,
        409,
      );
    }
    const prepared = prepareBlueprint(input.blueprint);
    if (!prepared.blueprint) {
      throw new BridgeError(`The blueprint was rejected:\n- ${prepared.errors.join('\n- ')}`);
    }
    const blueprint = prepared.blueprint;
    const now = this.now();
    let production = this.state.productions.find((item) => item.id === blueprint.id);
    if (production) {
      production.revision += 1;
      production.conceptId = concept.id;
      production.name = blueprint.name;
      production.kind = blueprint.kind ?? 'scene';
      production.blueprint = blueprint;
      production.warnings = prepared.warnings;
      production.phase = 'awaiting-import';
      production.updatedAt = now;
    } else {
      production = {
        id: blueprint.id!,
        conceptId: concept.id,
        name: blueprint.name,
        kind: blueprint.kind ?? 'scene',
        revision: 1,
        blueprint,
        warnings: prepared.warnings,
        importedRevision: 0,
        phase: 'awaiting-import',
        assets: [],
        reviews: [],
        createdAt: now,
        updatedAt: now,
      };
      this.state.productions.push(production);
    }
    this.emit(
      'production-submitted',
      `Production "${production.name}" revision ${production.revision} is queued for the studio.`,
      { conceptId: concept.id, productionId: production.id },
    );
    this.commit();
    return production;
  }

  /** Studio: the blueprint revision became tickets; records the asset roster. */
  markImported(id: string, payload: ImportedPayload): Production {
    const production = this.production(id);
    if (!Number.isInteger(payload.revision) || payload.revision < 1 || payload.revision > production.revision) {
      throw new BridgeError(`Invalid revision ${String(payload.revision)}.`);
    }
    if (!Array.isArray(payload.assets)) throw new BridgeError('"assets" must be an array.');
    const now = this.now();
    const previous = new Map(production.assets.map((asset) => [asset.assetId, asset]));
    production.assets = payload.assets.map((entry) => {
      const assetId = text(entry.assetId, 'assetId', { required: true, max: 120 });
      const existing = previous.get(assetId);
      return {
        assetId,
        title: text(entry.title, 'title', { max: 300 }) || assetId,
        status: status(entry.status),
        version: Number.isFinite(entry.version) ? entry.version : 1,
        notes: existing?.notes ?? [],
        delivered: existing?.delivered,
        updatedAt: now,
      };
    });
    production.importedRevision = Math.max(production.importedRevision, payload.revision);
    production.studio = {
      projectId: text(payload.projectId, 'projectId', { required: true, max: 120 }),
      sceneId: text(payload.sceneId, 'sceneId', { required: true, max: 120 }),
    };
    production.updatedAt = now;
    if (production.phase === 'awaiting-import' && production.importedRevision >= production.revision) {
      production.phase = 'in-production';
    }
    this.emit(
      'production-imported',
      `The studio created ${production.assets.length} ticket(s) for "${production.name}" (revision ${payload.revision}).`,
      { conceptId: production.conceptId, productionId: production.id },
    );
    this.recomputePhase(production);
    this.commit();
    return production;
  }

  /** Studio: an asset's status, version or notes changed. */
  syncAsset(productionId: string, assetId: string, payload: AssetSyncPayload): AssetRecord {
    const production = this.production(productionId);
    const asset = this.asset(productionId, assetId);
    const nextStatus = status(payload.status);
    const notes = Array.isArray(payload.notes) ? payload.notes : [];
    const known = new Set(asset.notes.map((note) => note.id));
    const artistNotes = notes.filter(
      (note) =>
        typeof note?.id === 'string' &&
        !known.has(note.id) &&
        !note.id.startsWith(AI_NOTE_PREFIX) &&
        !note.id.startsWith(DIRECTOR_NOTE_PREFIX),
    );
    const statusChanged = asset.status !== nextStatus;

    asset.title = text(payload.title, 'title', { max: 300 }) || asset.title;
    asset.status = nextStatus;
    asset.version = Number.isFinite(payload.version) ? payload.version : asset.version;
    asset.notes = notes
      .filter((note) => typeof note?.id === 'string' && typeof note.body === 'string')
      .map((note) => ({
        id: note.id,
        body: note.body.slice(0, MAX_TEXT),
        author: String(note.author ?? ''),
        createdAt: Number(note.createdAt) || this.now(),
      }));
    asset.updatedAt = this.now();
    production.updatedAt = asset.updatedAt;

    const refs = { conceptId: production.conceptId, productionId, assetId };
    if (statusChanged) {
      this.emit('asset-status', `"${asset.title}" is now ${nextStatus}.`, refs);
    }
    for (const note of artistNotes) {
      this.emit('artist-note', `The artist wrote on "${asset.title}": ${note.body}`, refs);
    }
    this.recomputePhase(production);
    this.commit();
    return asset;
  }

  /** Studio: the artist's artwork for an asset (PNG bytes). */
  deliverAsset(productionId: string, assetId: string, png: Buffer, meta: { hash: string; version: number }): AssetRecord {
    const production = this.production(productionId);
    const asset = this.asset(productionId, assetId);
    if (!isPng(png)) throw new BridgeError('Delivered artwork must be a PNG.');
    const hash = text(meta.hash, 'hash', { required: true, max: 64 });
    writeFileSync(this.assetPath(productionId, assetId), png);
    asset.delivered = { hash, version: meta.version || asset.version, deliveredAt: this.now(), bytes: png.length };
    asset.updatedAt = asset.delivered.deliveredAt;
    production.updatedAt = asset.updatedAt;
    this.emit('asset-delivered', `Artwork for "${asset.title}" was delivered (v${asset.delivered.version}).`, {
      conceptId: production.conceptId,
      productionId,
      assetId,
    });
    this.recomputePhase(production);
    this.commit();
    return asset;
  }

  /** Studio: the assembled scene (all assets in their layout slots). */
  deliverComposite(productionId: string, png: Buffer, hash: string): Production {
    const production = this.production(productionId);
    if (!isPng(png)) throw new BridgeError('The scene composite must be a PNG.');
    writeFileSync(this.compositePath(productionId), png);
    production.composite = { hash: text(hash, 'hash', { required: true, max: 64 }), deliveredAt: this.now() };
    this.commit();
    return production;
  }

  /** AI: message the artist on one asset — answers to questions, clarifications. */
  replyToArtist(productionId: string, assetId: string, message: string): AiReply {
    const production = this.production(productionId);
    this.asset(productionId, assetId);
    if (production.importedRevision === 0) {
      throw new BridgeError(`"${production.name}" has not reached the studio yet.`, 409);
    }
    const reply: AiReply = {
      id: newId(AI_NOTE_PREFIX),
      productionId,
      assetId,
      body: text(message, 'message', { required: true }),
      createdAt: this.now(),
    };
    this.state.replies.push(reply);
    this.commit();
    return reply;
  }

  /** Studio: the AI's reply is now a note on the ticket. */
  ackReply(id: string): void {
    const before = this.state.replies.length;
    this.state.replies = this.state.replies.filter((reply) => reply.id !== id);
    if (this.state.replies.length !== before) this.commit();
  }

  /** AI: present the delivered result to the director (loop step 7). */
  submitForReview(productionId: string, summary: string): Production {
    const production = this.production(productionId);
    const body = text(summary, 'summary', { required: true });
    const required = requiredAssets(production);
    const ready = required.length > 0 && required.every((asset) => asset.status === 'complete' && asset.delivered);
    if (production.phase === 'in-review') {
      throw new BridgeError(`"${production.name}" is already waiting for the director.`, 409);
    }
    if (production.phase === 'accepted') {
      throw new BridgeError(`"${production.name}" was already accepted.`, 409);
    }
    if (!ready || production.importedRevision < production.revision) {
      const missing = required.filter((asset) => !(asset.status === 'complete' && asset.delivered));
      throw new BridgeError(
        `Not everything is delivered yet. Waiting on: ${missing.map((asset) => `"${asset.title}" (${asset.status})`).join(', ') || 'the studio import'}.`,
        409,
      );
    }
    production.phase = 'in-review';
    production.reviews.push({ round: production.reviews.length + 1, summary: body, submittedAt: this.now() });
    production.updatedAt = this.now();
    this.emit('review-submitted', `"${production.name}" is waiting for the director's review.`, {
      conceptId: production.conceptId,
      productionId,
    });
    this.commit();
    return production;
  }

  /** Director: ACCEPTED (scene done) or DECLINED with per-asset rework (loop step 8). */
  decideReview(productionId: string, payload: ReviewDecisionPayload): Production {
    const production = this.production(productionId);
    if (production.phase !== 'in-review') {
      throw new BridgeError(`"${production.name}" is not waiting for a review.`, 409);
    }
    if (payload.decision !== 'accepted' && payload.decision !== 'declined') {
      throw new BridgeError('"decision" must be "accepted" or "declined".');
    }
    const feedback = text(payload.feedback, 'feedback');
    const rework = (Array.isArray(payload.rework) ? payload.rework : []).map((entry) => {
      const asset = this.asset(productionId, text(entry?.assetId, 'assetId', { required: true, max: 120 }));
      return { assetId: asset.assetId, note: text(entry.note, 'note') };
    });
    if (payload.decision === 'declined' && !feedback && rework.length === 0) {
      throw new BridgeError('Declining needs feedback or at least one asset marked for rework.');
    }
    const now = this.now();
    const round = production.reviews[production.reviews.length - 1];
    Object.assign(round, {
      decision: payload.decision,
      feedback: feedback || undefined,
      rework: rework.length ? rework : undefined,
      decidedAt: now,
    });
    production.phase = payload.decision === 'accepted' ? 'accepted' : 'changes-requested';
    production.updatedAt = now;
    const reworkText = rework.length
      ? ` Rework: ${rework.map((entry) => `"${this.asset(productionId, entry.assetId).title}"${entry.note ? ` (${entry.note})` : ''}`).join(', ')}.`
      : '';
    this.emit(
      payload.decision === 'accepted' ? 'review-accepted' : 'review-declined',
      payload.decision === 'accepted'
        ? `The director accepted "${production.name}" — scene done.${feedback ? ` ${feedback}` : ''}`
        : `The director declined "${production.name}".${feedback ? ` ${feedback}` : ''}${reworkText}`,
      { conceptId: production.conceptId, productionId },
    );
    this.commit();
    return production;
  }

  /** Keeps `phase` in line with asset delivery. Gates (review, accepted) only move by decision. */
  private recomputePhase(production: Production): void {
    if (production.phase === 'in-review' || production.phase === 'accepted') return;
    if (production.importedRevision < production.revision) {
      production.phase = 'awaiting-import';
      return;
    }
    const required = requiredAssets(production);
    const allDelivered =
      required.length > 0 && required.every((asset) => asset.status === 'complete' && asset.delivered);
    const lastDecision = production.reviews[production.reviews.length - 1]?.decidedAt ?? 0;
    const reworked = required.some((asset) => (asset.delivered?.deliveredAt ?? 0) > lastDecision);

    if (allDelivered && (production.phase !== 'changes-requested' || reworked)) {
      if (production.phase !== 'delivered') {
        production.phase = 'delivered';
        this.emit(
          'production-delivered',
          `All ${required.length} asset(s) of "${production.name}" are delivered — ready to present to the director.`,
          { conceptId: production.conceptId, productionId: production.id },
        );
      }
    } else if (production.phase !== 'changes-requested') {
      production.phase = 'in-production';
    }
  }

  // ---- files -------------------------------------------------------------------

  assetPath(productionId: string, assetId: string): string {
    if (!isSafeId(productionId) || !isSafeId(assetId)) throw new BridgeError('Invalid id.');
    const dir = join(this.assetDir, productionId);
    mkdirSync(dir, { recursive: true });
    return join(dir, `${assetId}.png`);
  }

  compositePath(productionId: string): string {
    if (!isSafeId(productionId)) throw new BridgeError('Invalid id.');
    const dir = join(this.assetDir, productionId);
    mkdirSync(dir, { recursive: true });
    return join(dir, '_composite.png');
  }

  readAsset(productionId: string, assetId: string): Buffer {
    const asset = this.asset(productionId, assetId);
    if (!asset.delivered) throw new BridgeError(`"${asset.title}" has no delivered artwork yet.`, 404);
    return readFileSync(this.assetPath(productionId, assetId));
  }

  readComposite(productionId: string): Buffer {
    const production = this.production(productionId);
    if (!production.composite) throw new BridgeError(`"${production.name}" has no scene composite yet.`, 404);
    return readFileSync(this.compositePath(productionId));
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(buffer: Buffer): boolean {
  return buffer.length > 8 && PNG_SIGNATURE.every((byte, index) => buffer[index] === byte);
}
