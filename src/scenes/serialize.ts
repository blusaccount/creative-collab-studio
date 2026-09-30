import type { Project, Scene, Ticket } from '../types';
import { composeTicketThumbnail } from '../drawing/compose';
import { BLUEPRINT_SCHEMA_VERSION } from './build';

export interface ProjectStateDocument {
  schemaVersion: number;
  kind: 'project-state';
  action: 'upsert';
  generatedAt: number;
  project: { id: string; name: string };
  scenes: Array<Record<string, unknown>>;
  tickets: Array<Record<string, unknown>>;
  report: { ok: boolean; errors: string[]; warnings: string[] };
}

/**
 * Serialises everything an AI needs to READ the current state of a project:
 * scenes/model sets, tickets with statuses + notes, and per-ticket thumbnails
 * (so the agent can actually "see" the produced art and review it).
 */
export async function buildProjectState(
  project: Project,
  scenes: Scene[],
  tickets: Ticket[],
): Promise<ProjectStateDocument> {
  const projectScenes = scenes.filter((scene) => scene.projectId === project.id);
  const projectTickets = tickets.filter((ticket) => ticket.projectId === project.id);

  const ticketDocs: Array<Record<string, unknown>> = [];
  for (const ticket of projectTickets) {
    let thumbnailDataUrl = '';
    try {
      thumbnailDataUrl = await composeTicketThumbnail(ticket, 256);
    } catch {
      thumbnailDataUrl = '';
    }
    ticketDocs.push({
      id: ticket.id,
      sceneId: ticket.sceneId,
      mapType: ticket.mapType,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      type: ticket.type,
      dimensions: ticket.dimensions,
      background: ticket.background,
      version: ticket.version,
      updatedAt: ticket.updatedAt,
      notes: ticket.notes.map((note) => ({ author: note.author, body: note.body, createdAt: note.createdAt })),
      thumbnailDataUrl,
    });
  }

  const sceneDocs = projectScenes.map((scene) => {
    const items = scene.items;
    const completed = items.filter(
      (item) => projectTickets.find((ticket) => ticket.id === item.ticketId)?.status === 'complete',
    ).length;
    return {
      id: scene.id,
      kind: scene.kind,
      name: scene.name,
      description: scene.description,
      artDirection: scene.artDirection,
      target: scene.target,
      canvas: scene.canvas,
      uvLayout: scene.uvLayout,
      mesh: scene.mesh,
      modelUrl: scene.modelFile?.url,
      modelName: scene.modelFile?.name,
      items: items.map((item) => ({
        ticketId: item.ticketId,
        label: item.label,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        layer: item.layer,
      })),
      completedAt: scene.completedAt,
      progress: { completed, total: items.length },
    };
  });

  return {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    kind: 'project-state',
    action: 'upsert',
    generatedAt: Date.now(),
    project: { id: project.id, name: project.name },
    scenes: sceneDocs,
    tickets: ticketDocs,
    report: { ok: true, errors: [], warnings: [] },
  };
}
