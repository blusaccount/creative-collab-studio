import type { LayerState, Project, Scene, StudioMeta, StudioSettings, Ticket } from '../types';
import { createDemoContent } from '../data/demo';
import { createSeedProject } from '../data/seed';
import { createDefaultLayerStates } from '../drawing/factory';
import {
  STORE_META,
  STORE_PROJECTS,
  STORE_SCENES,
  STORE_TICKETS,
  deleteRecord,
  deleteScenesForProject,
  deleteTicketsForProject,
  getAllRecords,
  putRecord,
  putRecords,
} from './db';

export const SCHEMA_VERSION = 3;

export const DEFAULT_SETTINGS: StudioSettings = {
  recentColors: ['#111827', '#f8fafc', '#fbbf24', '#f97316', '#a78bfa', '#34d399', '#ef4444'],
  theme: 'light',
  language: 'de',
  fileNamingTemplate: '{project}-{title}',
  useVersionSuffix: true,
  trimOnExport: false,
  demoSceneImported: false,
};

function normalizeLayers(layers: LayerState[] | undefined): LayerState[] {
  const source = layers && layers.length > 0 ? layers : createDefaultLayerStates();
  const seen = new Set<string>();
  const result: LayerState[] = [];
  for (const layer of source) {
    if (!layer || !layer.id || seen.has(layer.id)) continue;
    seen.add(layer.id);
    result.push(layer);
  }
  if (!result.some((layer) => layer.kind === 'draw')) {
    const fallback = createDefaultLayerStates().find((layer) => layer.kind === 'draw');
    if (fallback) result.push(fallback);
  }
  return result.length > 0 ? result : createDefaultLayerStates();
}

function normalizeTicket(ticket: Ticket): Ticket {
  return {
    ...ticket,
    status: ticket.status ?? 'backlog',
    notes: ticket.notes ?? [],
    layers: normalizeLayers(ticket.layers),
    background: ticket.background ?? 'white',
    version: ticket.version ?? 1,
    order: ticket.order ?? 0,
    updatedAt: ticket.updatedAt ?? ticket.createdAt ?? Date.now(),
    createdAt: ticket.createdAt ?? Date.now(),
  };
}

function normalizeScene(scene: Scene): Scene {
  return { ...scene, kind: scene.kind ?? 'scene' };
}

function nextOrder(tickets: Ticket[], projectId: string): number {
  return (
    tickets
      .filter((ticket) => ticket.projectId === projectId)
      .reduce((max, ticket) => Math.max(max, ticket.order), -1) + 1
  );
}

export interface StudioSnapshot {
  projects: Project[];
  tickets: Ticket[];
  scenes: Scene[];
  settings: StudioSettings;
}

export async function bootstrapStudio(): Promise<StudioSnapshot> {
  const [storedProjects, storedTickets, storedScenes, metaRecords] = await Promise.all([
    getAllRecords<Project>(STORE_PROJECTS),
    getAllRecords<Ticket>(STORE_TICKETS),
    getAllRecords<Scene>(STORE_SCENES),
    getAllRecords<StudioMeta>(STORE_META),
  ]);
  let projects = storedProjects;
  let tickets = storedTickets.map(normalizeTicket);
  let scenes = storedScenes.map(normalizeScene);

  if (projects.length === 0) {
    const project = createSeedProject();
    projects = [project];
    await putRecord(STORE_PROJECTS, project);
  }

  let settings = { ...DEFAULT_SETTINGS };
  const meta = metaRecords.find((item) => item.id === 'meta');
  if (meta) {
    settings = { ...DEFAULT_SETTINGS, ...meta.settings };
  }

  // Persist layer stacks that normalisation had to repair (duplicate/missing layers).
  const rawById = new Map(storedTickets.map((ticket) => [ticket.id, ticket]));
  const repaired = tickets.filter(
    (ticket) => ticket.layers.length !== (rawById.get(ticket.id)?.layers?.length ?? 0),
  );
  if (repaired.length > 0) await putRecords(STORE_TICKETS, repaired);

  // First run (or after "Reset demo"): load the curated demo state.
  if (scenes.length === 0 && !settings.demoSceneImported) {
    const project = projects[0];
    const demo = await createDemoContent(project.id, nextOrder(tickets, project.id));
    scenes = demo.scenes;
    tickets = [...tickets, ...demo.tickets];
    settings = {
      ...settings,
      demoSceneImported: true,
      lastProjectId: project.id,
      lastSceneId: demo.startSceneId,
      lastTicketId: demo.startTicketId,
    };
    await putRecords(STORE_SCENES, demo.scenes);
    await putRecords(STORE_TICKETS, demo.tickets);
  }

  await putRecord<StudioMeta>(STORE_META, {
    id: 'meta',
    schemaVersion: SCHEMA_VERSION,
    settings,
  });

  return { projects, tickets, scenes, settings };
}

export async function persistProject(project: Project): Promise<void> {
  await putRecord(STORE_PROJECTS, project);
}

export async function removeProject(projectId: string): Promise<void> {
  await deleteTicketsForProject(projectId);
  await deleteScenesForProject(projectId);
  await deleteRecord(STORE_PROJECTS, projectId);
}

export async function persistTicket(ticket: Ticket): Promise<void> {
  await putRecord(STORE_TICKETS, ticket);
}

export async function persistTickets(tickets: Ticket[]): Promise<void> {
  await putRecords(STORE_TICKETS, tickets);
}

export async function removeTicket(ticketId: string): Promise<void> {
  await deleteRecord(STORE_TICKETS, ticketId);
}

export async function persistScene(scene: Scene): Promise<void> {
  await putRecord(STORE_SCENES, scene);
}

export async function removeScene(sceneId: string): Promise<void> {
  await deleteRecord(STORE_SCENES, sceneId);
}

export async function persistSettings(settings: StudioSettings): Promise<void> {
  await putRecord<StudioMeta>(STORE_META, {
    id: 'meta',
    schemaVersion: SCHEMA_VERSION,
    settings,
  });
}
