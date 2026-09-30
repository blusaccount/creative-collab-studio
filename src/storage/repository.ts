import type { LayerState, Project, Scene, StudioMeta, StudioSettings, Ticket } from '../types';
import { DUNGEON_ENTRANCE_BLUEPRINT } from '../data/dungeonScene';
import { createSeedProject } from '../data/seed';
import { createDefaultLayerStates } from '../drawing/factory';
import { buildSceneFromBlueprint } from '../scenes/build';
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

const LEGACY_SEED_PREFIX = 'ticket-seed-';

export const SCHEMA_VERSION = 2;

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
  let [projects, tickets, scenes, metaRecords] = await Promise.all([
    getAllRecords<Project>(STORE_PROJECTS),
    getAllRecords<Ticket>(STORE_TICKETS),
    getAllRecords<Scene>(STORE_SCENES),
    getAllRecords<StudioMeta>(STORE_META),
  ]);

  if (projects.length === 0) {
    const project = createSeedProject();
    projects = [project];
    await putRecord(STORE_PROJECTS, project);
  }

  // One-time cleanup: drop the original hardcoded demo tickets so the queue
  // only contains real, scene-driven requirements.
  const legacyTickets = tickets.filter((ticket) => ticket.id.startsWith(LEGACY_SEED_PREFIX));
  if (legacyTickets.length > 0) {
    await Promise.all(legacyTickets.map((ticket) => deleteRecord(STORE_TICKETS, ticket.id)));
    tickets = tickets.filter((ticket) => !ticket.id.startsWith(LEGACY_SEED_PREFIX));
  }

  let settings = { ...DEFAULT_SETTINGS };
  const meta = metaRecords.find((item) => item.id === 'meta');
  if (meta) {
    settings = { ...DEFAULT_SETTINGS, ...meta.settings };
  }

  const rawTickets = tickets;
  tickets = tickets.map(normalizeTicket);
  // Repair records corrupted by an older duplicate-layer bug, then persist the fix.
  const repaired = tickets.filter(
    (ticket, index) => ticket.layers.length !== (rawTickets[index]?.layers?.length ?? 0),
  );
  if (repaired.length > 0) {
    await putRecords(STORE_TICKETS, tickets);
  }

  // One-time localization: bring an already-imported English demo scene in line
  // with the current (German) blueprint, matching assets by layout order.
  const legacyScene = scenes.find((scene) => scene.artDirection?.startsWith('Hand-painted'));
  if (legacyScene) {
    const ordered = [...legacyScene.items].sort((a, b) => a.layer - b.layer);
    if (ordered.length === DUNGEON_ENTRANCE_BLUEPRINT.assets.length) {
      const touched: Ticket[] = [];
      ordered.forEach((item, index) => {
        const asset = DUNGEON_ENTRANCE_BLUEPRINT.assets[index];
        const ticket = tickets.find((entry) => entry.id === item.ticketId);
        if (ticket && asset) {
          ticket.title = asset.title;
          ticket.description = asset.brief;
          touched.push(ticket);
        }
        item.label = asset?.title ?? item.label;
      });
      const localized: Scene = {
        ...legacyScene,
        name: DUNGEON_ENTRANCE_BLUEPRINT.name,
        description: DUNGEON_ENTRANCE_BLUEPRINT.description,
        artDirection: DUNGEON_ENTRANCE_BLUEPRINT.artDirection,
        items: legacyScene.items.map((item) => ({ ...item })),
        updatedAt: Date.now(),
      };
      scenes = scenes.map((scene) => (scene.id === legacyScene.id ? localized : scene));
      if (touched.length > 0) await putRecords(STORE_TICKETS, touched);
      await putRecord(STORE_SCENES, localized);
    }
  }

  // On first run, drop in the authored dungeon scene so the AI → artist →
  // scene-assembly workflow is immediately testable.
  if (scenes.length === 0 && !settings.demoSceneImported) {
    const project = projects[0];
    const { scene, tickets: generated } = buildSceneFromBlueprint(
      DUNGEON_ENTRANCE_BLUEPRINT,
      project.id,
      nextOrder(tickets, project.id),
    );
    scenes = [scene];
    tickets = [...tickets, ...generated];
    settings = { ...settings, demoSceneImported: true };
    await putRecords(STORE_SCENES, [scene]);
    await putRecords(STORE_TICKETS, generated);
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
