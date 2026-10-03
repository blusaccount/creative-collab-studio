// Shared data model of the AI bridge — imported by the bridge server (server/)
// and by the web app (src/bridge/). Keep this file free of DOM and Node APIs.
import type { SceneBlueprint, SetKind, TicketStatus } from '../types';

/**
 * Concept gate (loop steps 1–2): the director describes an idea, the AI drafts
 * a concept, the director approves or declines it.
 */
export type ConceptStatus = 'idea' | 'awaiting-director' | 'approved' | 'declined';

export type Decision = 'approved' | 'declined';

export interface ConceptRevision {
  revision: number;
  draft: string;
  submittedAt: number;
  decision?: Decision;
  feedback?: string;
  decidedAt?: number;
}

export interface Concept {
  id: string;
  title: string;
  /** The director's idea, as written in the Director view or relayed by the AI. */
  idea: string;
  status: ConceptStatus;
  /** 0 while only the idea exists; increments with every AI draft. */
  revision: number;
  /** The latest AI draft. Empty while status is "idea". */
  draft: string;
  /** Feedback from the latest decision. */
  feedback?: string;
  revisions: ConceptRevision[];
  createdBy: 'director' | 'ai';
  createdAt: number;
  updatedAt: number;
}

/**
 * Production phases (loop steps 3–8):
 * awaiting-import → in-production → delivered → in-review → accepted
 *                                                        ↘ changes-requested → delivered → in-review …
 */
export type ProductionPhase =
  | 'awaiting-import'
  | 'in-production'
  | 'delivered'
  | 'in-review'
  | 'changes-requested'
  | 'accepted';

export interface NoteRecord {
  id: string;
  body: string;
  author: string;
  createdAt: number;
}

export interface AssetDelivery {
  /** Content hash of the delivered artwork (layer hash from the studio). */
  hash: string;
  version: number;
  deliveredAt: number;
  bytes: number;
}

export interface AssetRecord {
  /** The blueprint's stable asset id (ticket.blueprintAssetId in the studio). */
  assetId: string;
  title: string;
  status: TicketStatus;
  version: number;
  notes: NoteRecord[];
  delivered?: AssetDelivery;
  updatedAt: number;
}

export interface ReworkRequest {
  assetId: string;
  note: string;
}

export interface ReviewRound {
  round: number;
  summary: string;
  submittedAt: number;
  decision?: 'accepted' | 'declined';
  feedback?: string;
  rework?: ReworkRequest[];
  decidedAt?: number;
}

export interface Production {
  /** Equals the blueprint id — stable across revisions. */
  id: string;
  conceptId: string;
  name: string;
  kind: SetKind;
  revision: number;
  blueprint: SceneBlueprint;
  /** Validation warnings for the latest revision. */
  warnings: string[];
  /** The latest revision the studio has turned into tickets (0 = never). */
  importedRevision: number;
  studio?: { projectId: string; sceneId: string };
  phase: ProductionPhase;
  assets: AssetRecord[];
  reviews: ReviewRound[];
  composite?: { hash: string; deliveredAt: number };
  createdAt: number;
  updatedAt: number;
}

/** A message from the AI to the artist on one asset, waiting to be shown in the studio. */
export interface AiReply {
  id: string;
  productionId: string;
  assetId: string;
  body: string;
  createdAt: number;
}

export type BridgeEventType =
  | 'idea-created'
  | 'concept-submitted'
  | 'concept-approved'
  | 'concept-declined'
  | 'production-submitted'
  | 'production-imported'
  | 'asset-status'
  | 'asset-delivered'
  | 'artist-note'
  | 'production-delivered'
  | 'review-submitted'
  | 'review-accepted'
  | 'review-declined';

export interface BridgeEvent {
  seq: number;
  at: number;
  type: BridgeEventType;
  conceptId?: string;
  productionId?: string;
  assetId?: string;
  message: string;
}

/** What GET /api/state returns to the studio. */
export interface BridgeSnapshot {
  /** Increments on every change; pass it back as ?since= to skip unchanged polls. */
  version: number;
  seq: number;
  concepts: Concept[];
  productions: Production[];
  replies: AiReply[];
}

export type BridgeStateResponse = BridgeSnapshot | { unchanged: true; version: number };

// ---- Studio → bridge payloads ------------------------------------------------

export interface CreateIdeaPayload {
  title: string;
  idea: string;
}

export interface ConceptDecisionPayload {
  decision: Decision;
  feedback?: string;
}

export interface ImportedPayload {
  revision: number;
  projectId: string;
  sceneId: string;
  assets: { assetId: string; title: string; status: TicketStatus; version: number }[];
}

export interface AssetSyncPayload {
  title: string;
  status: TicketStatus;
  version: number;
  notes: NoteRecord[];
}

export interface ReviewDecisionPayload {
  decision: 'accepted' | 'declined';
  feedback?: string;
  rework?: ReworkRequest[];
}

/** Note ids from the AI and the director carry these prefixes so they are not echoed back as artist notes. */
export const AI_NOTE_PREFIX = 'note-ai';
export const DIRECTOR_NOTE_PREFIX = 'note-director';

export const DEFAULT_BRIDGE_PORT = 4317;

/** Assets that still count towards delivery (archived tickets are out of scope). */
export function requiredAssets(production: Pick<Production, 'assets'>): AssetRecord[] {
  return production.assets.filter((asset) => asset.status !== 'archived');
}

export function deliveredCount(production: Pick<Production, 'assets'>): number {
  return requiredAssets(production).filter((asset) => asset.status === 'complete' && asset.delivered).length;
}
