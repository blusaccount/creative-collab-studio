import type { Note, Scene, Ticket, TicketStatus } from '../types';
import { buildSceneFromBlueprint } from '../scenes/build';
import { createId } from '../utils/id';
import { DUNGEON_ENTRANCE_BLUEPRINT } from './dungeonScene';
import { getPlayerKnightBlueprint } from './modelDemo';

/**
 * The curated demo state: the dungeon scene mid-production (most assets done,
 * one waiting for review, one being painted, one still open) plus the knight
 * model split into part tickets. "Demo zurücksetzen" always restores exactly this.
 *
 * Finished artwork is loaded from `public/demo/dungeon/<asset-id>.png`. Until a
 * file exists, a clearly labelled placeholder is drawn instead.
 */
interface DemoAssetState {
  status: TicketStatus;
  /** Load artwork from public/demo/dungeon/<id>.png (placeholder if missing). */
  art: boolean;
  notes?: Array<Pick<Note, 'author' | 'body'>>;
}

export const DEMO_DUNGEON_STATE: Record<string, DemoAssetState> = {
  'stone-wall': { status: 'complete', art: true },
  'floor-tiles': { status: 'complete', art: true },
  'iron-door': { status: 'complete', art: true },
  banner: { status: 'complete', art: true },
  'torch-holder': { status: 'complete', art: true },
  barrel: { status: 'complete', art: true },
  crate: { status: 'complete', art: true },
  cobweb: { status: 'complete', art: true },
  'treasure-chest': {
    status: 'review-ready',
    art: true,
    notes: [
      { author: 'Art Director', body: 'Das Gold wirkt super. Bitte das Schloss etwas größer – auf 64 px geht es unter.' },
    ],
  },
  // Painted live during the demo.
  'torch-flame': { status: 'in-progress', art: false },
  'dust-haze': { status: 'backlog', art: false },
};

/** The ticket the app opens on after a reset: the one painted live. */
export const DEMO_START_ASSET = 'torch-flame';

export function demoArtUrl(assetId: string): string {
  return `/demo/dungeon/${assetId}.png`;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Unable to load ${src}`));
    image.src = src;
  });
  return image;
}

/** Fetches a demo PNG; null when it is missing (dev servers answer 404s with index.html). */
async function fetchDemoArt(assetId: string): Promise<HTMLImageElement | null> {
  try {
    const response = await fetch(demoArtUrl(assetId));
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return null;
    const url = URL.createObjectURL(await response.blob());
    try {
      return await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

/** Fits the artwork into the ticket canvas (contain, centred) so nothing is distorted. */
function fitToCanvas(image: HTMLImageElement, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  return canvas.toDataURL('image/png');
}

/** A deliberately obvious stand-in so a missing file is never mistaken for real art. */
function drawPlaceholder(ticket: Ticket, assetId: string): string {
  const { width, height } = ticket.dimensions;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const inset = ticket.background === 'transparent' ? Math.round(Math.min(width, height) * 0.08) : 0;
  ctx.fillStyle = '#3a4150';
  ctx.fillRect(inset, inset, width - inset * 2, height - inset * 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(inset, inset, width - inset * 2, height - inset * 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 8;
  for (let x = -height; x < width; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height, 0);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#f5b942';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(inset + 1, inset + 1, width - inset * 2 - 2, height - inset * 2 - 2);
  ctx.setLineDash([]);
  const fontSize = Math.max(9, Math.min(22, Math.floor(width / 11)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f5b942';
  ctx.font = `700 ${fontSize}px Arial, sans-serif`;
  ctx.fillText('PLATZHALTER', width / 2, height / 2 - fontSize * 0.7);
  ctx.fillStyle = '#e5e7eb';
  ctx.font = `${Math.max(8, Math.round(fontSize * 0.7))}px Arial, sans-serif`;
  ctx.fillText(`${assetId}.png`, width / 2, height / 2 + fontSize * 0.6);
  return canvas.toDataURL('image/png');
}

export interface DemoSeed {
  scenes: Scene[];
  tickets: Ticket[];
  startTicketId?: string;
  startSceneId: string;
}

export async function createDemoContent(projectId: string, baseOrder = 0, now = Date.now()): Promise<DemoSeed> {
  const dungeon = buildSceneFromBlueprint(DUNGEON_ENTRANCE_BLUEPRINT, projectId, baseOrder, now);
  const knight = buildSceneFromBlueprint(
    getPlayerKnightBlueprint(),
    projectId,
    baseOrder + dungeon.tickets.length,
    now + dungeon.tickets.length,
  );

  const dungeonTickets = await Promise.all(
    dungeon.tickets.map(async (ticket) => {
      const assetId = ticket.blueprintAssetId;
      const state = assetId ? DEMO_DUNGEON_STATE[assetId] : undefined;
      if (!assetId || !state) return ticket;
      let layers = ticket.layers;
      if (state.art) {
        const image = await fetchDemoArt(assetId);
        const dataUrl = image
          ? fitToCanvas(image, ticket.dimensions.width, ticket.dimensions.height)
          : drawPlaceholder(ticket, assetId);
        layers = ticket.layers.map((layer) => (layer.kind === 'draw' ? { ...layer, dataUrl } : layer));
      }
      const notes: Note[] = (state.notes ?? []).map((note, index) => ({
        id: createId('note'),
        author: note.author,
        body: note.body,
        createdAt: now - (index + 1) * 60_000,
      }));
      return {
        ...ticket,
        status: state.status,
        layers,
        notes,
        completedAt: state.status === 'complete' ? now : undefined,
      } satisfies Ticket;
    }),
  );

  return {
    scenes: [dungeon.scene, knight.scene],
    tickets: [...dungeonTickets, ...knight.tickets],
    startTicketId: dungeonTickets.find((ticket) => ticket.blueprintAssetId === DEMO_START_ASSET)?.id,
    startSceneId: dungeon.scene.id,
  };
}
