import type { Ticket } from '../types';
import { getPaperPattern, BACKGROUND_COLORS } from './patterns';

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

export async function composeTicketCanvas(ticket: Ticket): Promise<HTMLCanvasElement> {
  const { width, height } = ticket.dimensions;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, width, height);
  paintBackground(ctx, ticket.background, width, height);

  for (const layer of ticket.layers) {
    if (!layer.visible || layer.kind !== 'draw' || !layer.dataUrl) continue;
    const image = await loadImage(layer.dataUrl);
    if (!image) continue;
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(image, 0, 0, width, height);
  }
  ctx.globalAlpha = 1;
  return canvas;
}

export async function composeTicketThumbnail(ticket: Ticket, maxSize = 220): Promise<string> {
  const full = await composeTicketCanvas(ticket);
  const scale = Math.min(1, maxSize / Math.max(full.width, full.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(full.width * scale));
  canvas.height = Math.max(1, Math.round(full.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export async function composeTicketBlob(ticket: Ticket): Promise<Blob | null> {
  const canvas = await composeTicketCanvas(ticket);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
