import type { BackgroundKind, Scene, SceneBlueprint, Ticket, TicketStatus, TicketType } from '../types';
import { createDefaultLayerStates } from '../drawing/factory';
import { createId } from '../utils/id';

export function buildSceneFromBlueprint(
  blueprint: SceneBlueprint,
  projectId: string,
  baseOrder: number,
  now = Date.now(),
): { scene: Scene; tickets: Ticket[] } {
  const sceneId = createId('scene');
  const tickets: Ticket[] = [];

  const items = blueprint.assets.map((asset, index) => {
    const ticket: Ticket = {
      id: createId('ticket'),
      projectId,
      sceneId,
      title: asset.title,
      description: asset.brief,
      type: asset.type,
      status: asset.status ?? 'backlog',
      dimensions: asset.dimensions,
      order: baseOrder + index,
      notes: [],
      layers: createDefaultLayerStates(),
      background: asset.background,
      version: 1,
      createdAt: now + index,
      updatedAt: now + index,
    };
    tickets.push(ticket);
    return {
      id: createId('item'),
      ticketId: ticket.id,
      label: asset.title,
      x: asset.layout.x,
      y: asset.layout.y,
      width: asset.layout.width,
      height: asset.layout.height,
      layer: asset.layout.layer,
    };
  });

  const scene: Scene = {
    id: sceneId,
    projectId,
    name: blueprint.name,
    description: blueprint.description,
    artDirection: blueprint.artDirection,
    canvas: blueprint.canvas,
    items,
    createdAt: now,
    updatedAt: now,
  };

  return { scene, tickets };
}

const TYPES: TicketType[] = ['texture', 'prop', 'ui', 'concept', 'effect', 'character', 'other'];
const BACKGROUNDS: BackgroundKind[] = ['white', 'transparent', 'dark', 'paper'];
const STATUSES: TicketStatus[] = ['backlog', 'in-progress', 'review-ready', 'complete', 'archived'];

function numberOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Best-effort validation of an imported scene blueprint. Returns null when the
 * payload is not a usable production plan, otherwise a normalized blueprint.
 */
export function validateBlueprint(value: unknown): SceneBlueprint | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.assets) || raw.assets.length === 0) return null;

  const canvasRaw = (raw.canvas ?? {}) as Record<string, unknown>;
  const canvas = {
    width: Math.max(1, Math.round(numberOf(canvasRaw.width, 960))),
    height: Math.max(1, Math.round(numberOf(canvasRaw.height, 540))),
    background: typeof canvasRaw.background === 'string' ? canvasRaw.background : '#0b0d12',
  };

  const assets: SceneBlueprint['assets'] = [];
  raw.assets.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const asset = entry as Record<string, unknown>;
    const title = typeof asset.title === 'string' && asset.title.trim() ? asset.title.trim() : `Asset ${index + 1}`;
    const dimsRaw = (asset.dimensions ?? {}) as Record<string, unknown>;
    const layoutRaw = (asset.layout ?? {}) as Record<string, unknown>;
    const type = TYPES.includes(asset.type as TicketType) ? (asset.type as TicketType) : 'prop';
    const background = BACKGROUNDS.includes(asset.background as BackgroundKind)
      ? (asset.background as BackgroundKind)
      : 'transparent';
    const status = STATUSES.includes(asset.status as TicketStatus)
      ? (asset.status as TicketStatus)
      : 'backlog';

    assets.push({
      title,
      type,
      status,
      dimensions: {
        width: Math.max(1, Math.round(numberOf(dimsRaw.width, canvas.width))),
        height: Math.max(1, Math.round(numberOf(dimsRaw.height, canvas.height))),
      },
      background,
      brief: typeof asset.brief === 'string' ? asset.brief : '',
      layout: {
        x: Math.round(numberOf(layoutRaw.x, 0)),
        y: Math.round(numberOf(layoutRaw.y, 0)),
        width: Math.max(1, Math.round(numberOf(layoutRaw.width, dimsRaw.width as number))),
        height: Math.max(1, Math.round(numberOf(layoutRaw.height, dimsRaw.height as number))),
        layer: Math.round(numberOf(layoutRaw.layer, index)),
      },
    });
  });

  if (assets.length === 0) return null;

  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Imported scene',
    description: typeof raw.description === 'string' ? raw.description : '',
    artDirection: typeof raw.artDirection === 'string' ? raw.artDirection : '',
    canvas,
    assets,
  };
}
