import type { LayerState, Project, Scene, StudioMeta, StudioSettings, Ticket, UvIsland } from '../types';
import { DUNGEON_ENTRANCE_BLUEPRINT } from '../data/dungeonScene';
import { getPlayerKnightBlueprint, PLAYER_KNIGHT_NAME } from '../data/modelDemo';
import { createSeedProject } from '../data/seed';
import { createDefaultLayerStates } from '../drawing/factory';
import { buildSceneFromBlueprint } from '../scenes/build';
import { createId } from '../utils/id';
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

async function cropLayersToPart(
  layers: LayerState[],
  dimensions: Ticket['dimensions'],
  part: UvIsland,
): Promise<LayerState[]> {
  return Promise.all(layers.map(async (layer) => {
    if (!layer.dataUrl) return { ...layer, id: createId('layer') };
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Unable to crop stored model texture layer "${layer.name}".`));
      image.src = layer.dataUrl;
    });
    const width = Math.max(1, Math.round(dimensions.width * part.w));
    const height = Math.max(1, Math.round(dimensions.height * part.h));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to create canvas while migrating model-part textures.');
    context.drawImage(
      image,
      part.x * image.naturalWidth,
      part.y * image.naturalHeight,
      part.w * image.naturalWidth,
      part.h * image.naturalHeight,
      0,
      0,
      width,
      height,
    );
    return { ...layer, id: createId('layer'), dataUrl: canvas.toDataURL('image/png') };
  }));
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
  let tickets = storedTickets;
  let scenes = storedScenes;

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
  scenes = scenes.map(normalizeScene);
  const mergedTickets: Ticket[] = [];
  let migratedScenes = false;
  for (const scene of scenes) {
    if (scene.kind !== 'model') continue;
    const entries = scene.items
      .map((item) => ({ item, ticket: tickets.find((candidate) => candidate.id === item.ticketId) }))
      .filter((entry): entry is { item: Scene['items'][number]; ticket: Ticket } => Boolean(entry.ticket));
    if (
      entries.length < 2 ||
      entries.length !== scene.items.length ||
      entries.some(({ ticket }) => !ticket.mapType || ticket.materialChannels?.length) ||
      new Set(entries.map(({ ticket }) => ticket.mapType)).size !== entries.length
    ) continue;

    const base = entries.find(({ ticket }) => ticket.mapType === 'basecolor') ?? entries[0];
    const channels = entries.map(({ ticket }) => ({
      map: ticket.mapType!,
      title: ticket.title,
      brief: ticket.description,
    }));
    const materialMapLayers = Object.fromEntries(
      entries
        .filter(({ ticket }) => ticket.id !== base.ticket.id || base.ticket.mapType !== 'basecolor')
        .map(({ ticket }) => [ticket.mapType!, ticket.layers]),
    ) as Ticket['materialMapLayers'];
    const everyChannelComplete = entries.every(({ ticket }) => ticket.status === 'complete');
    const consolidated: Ticket = {
      ...base.ticket,
      mapType: 'basecolor',
      materialChannels: channels,
      materialMapLayers,
      notes: entries.flatMap(({ ticket }) =>
        ticket.notes.map((note) =>
          ticket.id === base.ticket.id
            ? note
            : { ...note, body: `[${ticket.title}] ${note.body}` },
        ),
      ),
      status: everyChannelComplete
        ? 'complete'
        : base.ticket.status === 'complete'
          ? 'in-progress'
          : base.ticket.status,
      completedAt: everyChannelComplete ? base.ticket.completedAt : undefined,
      updatedAt: Date.now(),
    };
    const removedIds = new Set(entries.filter(({ ticket }) => ticket.id !== base.ticket.id).map(({ ticket }) => ticket.id));
    tickets = tickets.filter((ticket) => !removedIds.has(ticket.id)).map((ticket) =>
      ticket.id === consolidated.id ? consolidated : ticket,
    );
    const baseItem = base.item;
    const updatedScene: Scene = {
      ...scene,
      items: [
        {
          ...baseItem,
          label: base.ticket.title,
          width: base.ticket.dimensions.width,
          height: base.ticket.dimensions.height,
        },
      ],
      updatedAt: Date.now(),
    };
    scenes = scenes.map((item) => (item.id === scene.id ? updatedScene : item));
    mergedTickets.push(consolidated);
    for (const id of removedIds) await deleteRecord(STORE_TICKETS, id);
    migratedScenes = true;
  }
  if (mergedTickets.length > 0) await putRecords(STORE_TICKETS, mergedTickets);
  if (migratedScenes) await putRecords(STORE_SCENES, scenes);

  const splitKnightTickets: Ticket[] = [];
  let splitKnightScene: Scene | null = null;
  for (const scene of scenes) {
    if (
      scene.kind !== 'model' ||
      !scene.name.startsWith(PLAYER_KNIGHT_NAME) ||
      !scene.uvLayout?.length ||
      scene.items.length !== 1
    ) continue;
    const original = tickets.find((ticket) => ticket.id === scene.items[0].ticketId);
    if (!original?.materialChannels?.length || original.modelPart) continue;
    for (const [index, part] of scene.uvLayout.entries()) {
      const dimensions = {
        width: Math.max(1, Math.round(original.dimensions.width * part.w)),
        height: Math.max(1, Math.round(original.dimensions.height * part.h)),
      };
      const channels = original.materialChannels.map((channel) => ({ ...channel, part: part.name }));
      const baseColorBrief = channels.find((channel) => channel.map === 'basecolor')?.brief;
      const materialMapLayers = Object.fromEntries(await Promise.all(
        channels
          .filter((channel) => channel.map !== 'basecolor')
          .map(async (channel) => [
            channel.map,
            await cropLayersToPart(
              original.materialMapLayers?.[channel.map] ?? createDefaultLayerStates(),
              original.dimensions,
              part,
            ),
          ]),
      )) as Ticket['materialMapLayers'];
      const layers = await cropLayersToPart(original.layers, original.dimensions, part);
      const ticket: Ticket = {
        ...original,
        id: index === 0 ? original.id : createId('ticket'),
        title: part.name,
        description: baseColorBrief && !baseColorBrief.includes('pro Insel')
          ? baseColorBrief
          : `Farben und Details für ${part.name}.`,
        mapType: 'basecolor',
        materialChannels: channels,
        materialMapLayers,
        modelPart: part,
        dimensions,
        order: original.order + index,
        layers,
        notes: index === 0 ? original.notes : [],
        updatedAt: Date.now(),
      };
      splitKnightTickets.push(ticket);
    }
    splitKnightScene = {
      ...scene,
      items: splitKnightTickets.map((ticket, index) => ({
        id: index === 0 ? scene.items[0].id : createId('item'),
        ticketId: ticket.id,
        label: ticket.title,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        layer: index,
      })),
      updatedAt: Date.now(),
    };
    break;
  }
  if (splitKnightScene && splitKnightTickets.length > 0) {
    tickets = tickets
      .filter((ticket) => ticket.id !== splitKnightTickets[0].id)
      .concat(splitKnightTickets);
    scenes = scenes.map((scene) => scene.id === splitKnightScene!.id ? splitKnightScene! : scene);
    await putRecords(STORE_TICKETS, splitKnightTickets);
    await putRecord(STORE_SCENES, splitKnightScene);
  }

  // Repair records corrupted by an older duplicate-layer bug, then persist the fix.
  // Match by id: `tickets` is consolidated/split/reordered above, so array indices
  // no longer line up with the pre-migration snapshot.
  const rawById = new Map(rawTickets.map((ticket) => [ticket.id, ticket]));
  const repaired = tickets.filter((ticket) => {
    const raw = rawById.get(ticket.id);
    return raw ? ticket.layers.length !== (raw.layers?.length ?? 0) : false;
  });
  if (repaired.length > 0) {
    await putRecords(STORE_TICKETS, tickets);
  }

  // One-time upgrade: give an already-imported Player – Ritter model set its UV
  // layout, so the 3D preview can show the matching mesh.
  const knight = scenes.find((scene) => scene.kind === 'model' && scene.name === PLAYER_KNIGHT_NAME);
  if (knight && (!knight.uvLayout || knight.uvLayout.length === 0 || !knight.mesh)) {
    const blueprint = getPlayerKnightBlueprint();
    const upgraded: Scene = {
      ...knight,
      uvLayout: knight.uvLayout?.length ? knight.uvLayout : blueprint.uvLayout,
      uvTemplate: knight.uvTemplate || blueprint.uvTemplate,
      mesh: knight.mesh ?? blueprint.mesh,
      updatedAt: Date.now(),
    };
    scenes = scenes.map((scene) => (scene.id === knight.id ? upgraded : scene));
    await putRecord(STORE_SCENES, upgraded);
  }

  // One-time localization: bring an already-imported English demo scene in line
  // with the current (German) blueprint, matching assets by layout order.
  const legacyScene = scenes.find((scene) => scene.artDirection?.startsWith('Hand-painted'));
  if (legacyScene) {
    const blueprintAssets = DUNGEON_ENTRANCE_BLUEPRINT.assets ?? [];
    const ordered = [...legacyScene.items].sort((a, b) => a.layer - b.layer);
    if (ordered.length === blueprintAssets.length) {
      const touched: Ticket[] = [];
      ordered.forEach((item, index) => {
        const asset = blueprintAssets[index];
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
