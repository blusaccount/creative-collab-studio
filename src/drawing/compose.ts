import type { LayerState, MapType, Ticket, UvIsland } from '../types';
import { getPaperPattern, BACKGROUND_COLORS } from './patterns';
import { trimCanvas } from './trim';

function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  if (!dataUrl) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

export function paintBackground(
  ctx: CanvasRenderingContext2D,
  background: Ticket['background'],
  width: number,
  height: number,
): void {
  if (background === 'transparent') return;
  if (background === 'paper') {
    const pattern = ctx.createPattern(getPaperPattern(), 'repeat');
    ctx.fillStyle = pattern ?? BACKGROUND_COLORS.paper;
  } else {
    ctx.fillStyle = BACKGROUND_COLORS[background];
  }
  ctx.fillRect(0, 0, width, height);
}

export async function composeLayerCanvas(
  dimensions: Ticket['dimensions'],
  background: Ticket['background'],
  layers: LayerState[],
): Promise<HTMLCanvasElement> {
  const { width, height } = dimensions;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, width, height);
  paintBackground(ctx, background, width, height);

  for (const layer of layers) {
    if (!layer.visible || layer.kind !== 'draw' || !layer.dataUrl) continue;
    const image = await loadImage(layer.dataUrl);
    if (!image) continue;
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(image, 0, 0, width, height);
  }
  ctx.globalAlpha = 1;
  return canvas;
}

export async function composeTicketCanvas(ticket: Ticket): Promise<HTMLCanvasElement> {
  return composeLayerCanvas(ticket.dimensions, ticket.background, ticket.layers);
}

export function modelMapFallbackColor(map: MapType): string {
  switch (map) {
    case 'normal': return '#8080ff';
    case 'metallic':
    case 'emissive': return '#000000';
    case 'height': return '#808080';
    case 'roughness':
    case 'ao':
    case 'opacity':
    case 'packed':
    case 'other':
    case 'basecolor':
      return '#ffffff';
  }
}

export async function composeModelMapCanvas(
  tickets: Ticket[],
  map: MapType,
  dimensions: { width: number; height: number },
  live?: { ticketId: string; canvas: HTMLCanvasElement },
): Promise<HTMLCanvasElement | null> {
  const relevant = tickets.flatMap((ticket) => {
    const channel = ticket.materialChannels?.find((entry) => entry.map === map);
    if (!channel && ticket.mapType !== map) return [];
    const layers = ticket.materialChannels?.length
      ? map === 'basecolor'
        ? ticket.layers
        : ticket.materialMapLayers?.[map] ?? []
      : ticket.layers;
    return [{ ticket, layers }];
  });
  if (relevant.length === 0) return null;

  const atlas = document.createElement('canvas');
  atlas.width = dimensions.width;
  atlas.height = dimensions.height;
  const context = atlas.getContext('2d');
  if (!context) return atlas;
  context.fillStyle = modelMapFallbackColor(map);
  context.fillRect(0, 0, atlas.width, atlas.height);

  for (const { ticket, layers } of relevant) {
    const isLiveTicket = live?.ticketId === ticket.id;
    const source = isLiveTicket
      ? live.canvas
      : await composeLayerCanvas(
          ticket.dimensions,
          ticket.modelPart ? 'transparent' : ticket.background,
          layers,
        );
    const part = ticket.modelPart;
    if (part) {
      const x = Math.round(part.x * atlas.width);
      const y = Math.round(part.y * atlas.height);
      const width = Math.round(part.w * atlas.width);
      const height = Math.round(part.h * atlas.height);
      context.drawImage(source, 0, 0, source.width, source.height, x, y, width, height);
    } else {
      context.drawImage(source, 0, 0, atlas.width, atlas.height);
    }
  }
  return atlas;
}

export async function composeTicketThumbnail(ticket: Ticket, maxSize = 220, part?: UvIsland): Promise<string> {
  const { width, height } = ticket.dimensions;
  const source = await composeTicketCanvas(ticket);
  const crop = part
    ? {
        x: Math.round(part.x * width),
        y: Math.round(part.y * height),
        width: Math.round(part.w * width),
        height: Math.round(part.h * height),
      }
    : { x: 0, y: 0, width, height };
  const scale = Math.min(1, maxSize / Math.max(crop.width, crop.height));
  const targetWidth = Math.max(1, Math.round(crop.width * scale));
  const targetHeight = Math.max(1, Math.round(crop.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL('image/png');
}

export async function composeTicketBlob(ticket: Ticket, trim = false): Promise<Blob | null> {
  const canvas = await composeTicketCanvas(ticket);
  const output = trim ? trimCanvas(canvas) : canvas;
  return new Promise((resolve) => output.toBlob((blob) => resolve(blob), 'image/png'));
}
