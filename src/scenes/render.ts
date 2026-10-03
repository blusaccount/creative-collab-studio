import type { Scene, Ticket } from '../types';
import { t } from '../i18n';
import { composeTicketCanvas } from '../drawing/compose';

/** Paints a scene: completed assets in their layout slots, optional placeholders for the rest. */
export async function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  ticketById: Map<string, Ticket>,
  showPlaceholders: boolean,
): Promise<void> {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, scene.canvas.width, scene.canvas.height);
  ctx.fillStyle = scene.canvas.background;
  ctx.fillRect(0, 0, scene.canvas.width, scene.canvas.height);

  const items = [...scene.items].sort((a, b) => a.layer - b.layer);
  for (const item of items) {
    const ticket = ticketById.get(item.ticketId);
    if (ticket && ticket.status === 'complete') {
      const composed = await composeTicketCanvas(ticket);
      ctx.drawImage(composed, item.x, item.y, item.width, item.height);
    } else if (showPlaceholders) {
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(item.x + 0.5, item.y + 0.5, item.width - 1, item.height - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, item.x + item.width / 2, item.y + item.height / 2, item.width - 12);
      if (ticket) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillText(
          t(`status.${ticket.status}` as const),
          item.x + item.width / 2,
          item.y + item.height / 2 + 16,
          item.width - 12,
        );
      }
      ctx.restore();
    }
  }
}

/** The finished scene as a PNG (completed assets only, no placeholders). */
export async function renderSceneBlob(scene: Scene, tickets: Ticket[]): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = scene.canvas.width;
  canvas.height = scene.canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  await drawScene(ctx, scene, new Map(tickets.map((ticket) => [ticket.id, ticket])), false);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
