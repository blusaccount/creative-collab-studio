import { writePsd, readPsd } from 'ag-psd';
import type { Ticket } from '../types';
import { BACKGROUND_COLORS } from '../drawing/patterns';

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function findReferenceImage(ticket: Ticket): string | undefined {
  const reference = ticket.layers.find((layer) => layer.kind === 'reference' && layer.dataUrl);
  return reference?.dataUrl;
}

function paintTicketBackground(
  ctx: CanvasRenderingContext2D,
  ticket: Ticket,
  width: number,
  height: number,
): void {
  if (ticket.background === 'transparent') return;
  ctx.fillStyle = BACKGROUND_COLORS[ticket.background as keyof typeof BACKGROUND_COLORS] ?? '#ffffff';
  ctx.fillRect(0, 0, width, height);
}

/**
 * Builds a Photoshop template for a ticket: correct pixel dimensions, an
 * optional "Reference" layer and an empty "Paint" layer to draw on.
 */
export async function composeTemplatePsd(ticket: Ticket): Promise<Blob | null> {
  const { width, height } = ticket.dimensions;
  const children: Array<Record<string, unknown>> = [];

  if (ticket.background !== 'transparent') {
    const background = createCanvas(width, height);
    paintTicketBackground(background.getContext('2d')!, ticket, width, height);
    children.push({ name: 'Background', canvas: background, opacity: 1 });
  }

  const referenceData = findReferenceImage(ticket);
  if (referenceData) {
    const image = await loadImage(referenceData);
    if (image) {
      const reference = createCanvas(width, height);
      reference.getContext('2d')!.drawImage(image, 0, 0, width, height);
      children.push({ name: 'Reference', canvas: reference, opacity: 0.5 });
    }
  }

  children.push({ name: 'Paint', canvas: createCanvas(width, height), opacity: 1 });

  const buffer = writePsd({ width, height, children } as never);
  return new Blob([buffer as ArrayBuffer], { type: 'image/vnd.adobe.photoshop' });
}

/** A plain PNG template (reference + background) at the exact ticket size. */
export async function composeTemplatePng(ticket: Ticket): Promise<Blob | null> {
  const { width, height } = ticket.dimensions;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paintTicketBackground(ctx, ticket, width, height);
  const referenceData = findReferenceImage(ticket);
  if (referenceData) {
    const image = await loadImage(referenceData);
    if (image) {
      ctx.globalAlpha = 0.5; // match the PSD reference layer opacity
      ctx.drawImage(image, 0, 0, width, height);
      ctx.globalAlpha = 1;
    }
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

function imageDataToCanvas(image: ImageData): HTMLCanvasElement {
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  return canvas;
}

interface PsdNode {
  canvas?: HTMLCanvasElement;
  imageData?: ImageData;
  hidden?: boolean;
  opacity?: number;
  children?: PsdNode[];
}

function flattenToCanvas(node: PsdNode, target: CanvasRenderingContext2D, width: number, height: number): void {
  if (node.children && node.children.length > 0) {
    node.children.forEach((child) => flattenToCanvas(child, target, width, height));
    return;
  }
  if (node.hidden) return;
  const canvas = node.canvas ?? (node.imageData ? imageDataToCanvas(node.imageData) : null);
  if (!canvas) return;
  target.globalAlpha = typeof node.opacity === 'number' ? node.opacity : 1;
  target.drawImage(canvas, 0, 0, width, height);
}

/**
 * Reads a finished PSD back and returns it as a flattened canvas (used to
 * import artwork that was painted in Photoshop).
 */
export async function readPsdToCanvas(blob: Blob): Promise<HTMLCanvasElement | null> {
  const buffer = await blob.arrayBuffer();
  const psd = readPsd(buffer) as unknown as PsdNode & { width: number; height: number };
  const width = Math.max(1, psd.width);
  const height = Math.max(1, psd.height);

  if (psd.canvas) {
    const out = createCanvas(width, height);
    out.getContext('2d')!.drawImage(psd.canvas, 0, 0, width, height);
    return out;
  }

  const out = createCanvas(width, height);
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  flattenToCanvas(psd, ctx, width, height);
  ctx.globalAlpha = 1;
  return out;
}

/** Loads any raster image (png/jpg/webp) into a canvas. */
export async function readImageToCanvas(blob: Blob): Promise<HTMLCanvasElement | null> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    if (!image) return null;
    const canvas = createCanvas(image.naturalWidth || image.width, image.naturalHeight || image.height);
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function isPsdFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.psd');
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
