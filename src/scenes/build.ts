import type {
  BackgroundKind,
  EngineTarget,
  MapType,
  Scene,
  SceneBlueprint,
  SceneBlueprintMap,
  BlueprintReference,
  MeshPart,
  MeshSpec,
  SetKind,
  Ticket,
  TicketStatus,
  TicketType,
  UvIsland,
} from '../types';
import { createDefaultLayerStates } from '../drawing/factory';
import { createId } from '../utils/id';
import { t } from '../i18n';
import { mapDefaultBackground, MAP_TYPES } from './maps';

const MAX_DIMENSION = 8192;

function clampDimension(value: number): number {
  return Math.max(1, Math.min(MAX_DIMENSION, Math.round(value)));
}

const DEFAULT_MODEL_CANVAS = { width: 2048, height: 2048, background: '#0b0d12' };

const MAP_TITLES: Record<MapType, string> = {
  basecolor: 'BaseColor',
  normal: 'Normal',
  roughness: 'Roughness',
  metallic: 'Metallic',
  ao: 'AO',
  emissive: 'Emissive',
  opacity: 'Opacity',
  height: 'Height',
  packed: 'ORM',
  other: 'Map',
};

export function createPartUvTemplate(name: string): string {
  const label = name.replace(/[<>&"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
  })[character] ?? character);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#161922"/><path d="M0 64H512M0 128H512M0 192H512M0 256H512M0 320H512M0 384H512M0 448H512M64 0V512M128 0V512M192 0V512M256 0V512M320 0V512M384 0V512M448 0V512" stroke="#ffffff" stroke-opacity=".08"/><rect x="3" y="3" width="506" height="506" fill="#4cc2ff" fill-opacity=".08" stroke="#4cc2ff" stroke-width="6"/><text x="18" y="40" fill="#ffffff" font-family="Arial,sans-serif" font-size="24" font-weight="600">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

interface BuiltEntry {
  id?: string;
  title: string;
  type: TicketType;
  status: TicketStatus;
  map?: MapType;
  materialChannels?: SceneBlueprintMap[];
  modelPart?: UvIsland;
  dimensions: { width: number; height: number };
  background: BackgroundKind;
  brief: string;
  layout: { x: number; y: number; width: number; height: number; layer: number };
}

function entriesFromBlueprint(blueprint: SceneBlueprint): BuiltEntry[] {
  const size = blueprint.canvas ?? { width: 512, height: 512, background: '#ffffff' };

  if (blueprint.maps && blueprint.maps.length > 0) {
    if (blueprint.kind === 'model') {
      const partMaps = blueprint.maps.filter((map) => map.part);
      if (
        partMaps.length === blueprint.maps.length &&
        blueprint.uvLayout?.length &&
        partMaps.every((map) => blueprint.uvLayout!.some((island) => island.name === map.part))
      ) {
        return blueprint.uvLayout.flatMap((island, index) => {
          const channels = partMaps.filter((map) => map.part === island.name);
          if (channels.length === 0) return [];
          const baseColor = channels.find((map) => map.map === 'basecolor') ?? channels[0];
          const atlasDimensions = baseColor.dimensions ?? { width: size.width, height: size.height };
          return [{
            id: baseColor.id,
            title: island.name,
            type: 'texture' as TicketType,
            status: 'backlog' as TicketStatus,
            map: 'basecolor' as MapType,
            materialChannels: channels,
            modelPart: island,
            dimensions: {
              width: Math.max(1, Math.round(atlasDimensions.width * island.w)),
              height: Math.max(1, Math.round(atlasDimensions.height * island.h)),
            },
            background: baseColor.background ?? mapDefaultBackground('basecolor'),
            brief: baseColor.brief ?? '',
            layout: { x: 0, y: 0, width: island.w, height: island.h, layer: index },
          }];
        });
      }
      const baseColor = blueprint.maps.find((map) => map.map === 'basecolor') ?? blueprint.maps[0];
      return [{
        id: baseColor.id,
        title: baseColor.title ?? MAP_TITLES[baseColor.map] ?? 'BaseColor',
        type: 'texture',
        status: 'backlog',
        map: 'basecolor',
        materialChannels: blueprint.maps,
        dimensions: baseColor.dimensions ?? { width: size.width, height: size.height },
        background: baseColor.background ?? mapDefaultBackground('basecolor'),
        brief: baseColor.brief ?? '',
        layout: { x: 0, y: 0, width: size.width, height: size.height, layer: 0 },
      }];
    }
    return blueprint.maps.map((map, index) => ({
      id: map.id,
      title: map.title ?? `${MAP_TITLES[map.map] ?? 'Map'}`,
      type: 'texture' as TicketType,
      status: 'backlog' as TicketStatus,
      map: map.map,
      dimensions: map.dimensions ?? { width: size.width, height: size.height },
      background: map.background ?? mapDefaultBackground(map.map),
      brief: map.brief ?? '',
      layout: { x: 0, y: 0, width: size.width, height: size.height, layer: index },
    }));
  }

  return (blueprint.assets ?? []).map((asset) => ({
    id: asset.id,
    title: asset.title,
    type: asset.type,
    status: asset.status ?? 'backlog',
    map: asset.map,
    dimensions: asset.dimensions,
    background: asset.background,
    brief: asset.brief,
    layout: asset.layout,
  }));
}

export function buildSceneFromBlueprint(
  blueprint: SceneBlueprint,
  projectId: string,
  baseOrder: number,
  now = Date.now(),
): { scene: Scene; tickets: Ticket[] } {
  const sceneId = createId('scene');
  const tickets: Ticket[] = [];
  const entries = entriesFromBlueprint(blueprint);

  const items = entries.map((entry, index) => {
    const ticket: Ticket = {
      id: entry.id ?? createId('ticket'),
      projectId,
      sceneId,
      mapType: entry.map,
      materialChannels: entry.materialChannels,
      modelPart: entry.modelPart,
      title: entry.title,
      description: entry.brief,
      type: entry.type,
      status: entry.status,
      dimensions: entry.dimensions,
      order: baseOrder + index,
      notes: [],
      layers: entry.map
        ? createDefaultLayerStates({
            paintName: `Paint – ${MAP_TITLES[entry.map] ?? 'Map'}`,
            referenceName: 'UV – Reference',
          })
        : createDefaultLayerStates(),
      background: entry.background,
      version: 1,
      createdAt: now + index,
      updatedAt: now + index,
    };
    if (entry.modelPart) {
      const reference = ticket.layers.find((layer) => layer.kind === 'reference');
      if (reference) reference.dataUrl = createPartUvTemplate(entry.modelPart.name);
    }
    tickets.push(ticket);
    return {
      id: createId('item'),
      ticketId: ticket.id,
      label: entry.title,
      x: entry.layout.x,
      y: entry.layout.y,
      width: entry.layout.width,
      height: entry.layout.height,
      layer: entry.layout.layer,
    };
  });

  const scene: Scene = {
    id: blueprint.id ?? sceneId,
    projectId,
    kind: blueprint.kind ?? 'scene',
    name: blueprint.name,
    description: blueprint.description,
    artDirection: blueprint.artDirection,
    canvas: blueprint.canvas ?? (blueprint.kind === 'model' ? DEFAULT_MODEL_CANVAS : { width: 960, height: 540, background: '#0b0d12' }),
    items,
    target: blueprint.target,
    uvTemplate: blueprint.uvTemplate,
    uvLayout: blueprint.uvLayout,
    mesh: blueprint.mesh,
    modelFile: blueprint.modelUrl
      ? { name: blueprint.modelName ?? 'model.glb', url: blueprint.modelUrl }
      : undefined,
    createdAt: now,
    updatedAt: now,
  };

  return { scene, tickets };
}

const TYPES: TicketType[] = ['texture', 'prop', 'ui', 'concept', 'effect', 'character', 'other'];
const BACKGROUNDS: BackgroundKind[] = ['white', 'transparent', 'dark', 'paper'];
const STATUSES: TicketStatus[] = ['backlog', 'in-progress', 'review-ready', 'complete', 'archived'];
const KINDS: SetKind[] = ['scene', 'model'];
const ENGINES: EngineTarget[] = ['unreal', 'unity', 'gltf'];

function numberOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const SHAPES: MeshPart['shape'][] = ['box', 'cylinder', 'sphere'];

function triple(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (Array.isArray(value) && value.length >= 3) {
    return [numberOf(value[0], fallback[0]), numberOf(value[1], fallback[1]), numberOf(value[2], fallback[2])];
  }
  return fallback;
}

function normalizeMesh(raw: unknown): MeshSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const partsRaw = (raw as Record<string, unknown>).parts;
  if (!Array.isArray(partsRaw)) return undefined;
  const parts: MeshPart[] = [];
  partsRaw.slice(0, 64).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const part = entry as Record<string, unknown>;
    const shape = SHAPES.includes(part.shape as MeshPart['shape']) ? (part.shape as MeshPart['shape']) : 'box';
    const uvRaw = Array.isArray(part.uv) ? part.uv : [];
    parts.push({
      name: typeof part.name === 'string' ? part.name : undefined,
      shape,
      size: triple(part.size, [1, 1, 1]),
      position: triple(part.position, [0, 0, 0]),
      rotation: triple(part.rotation, [0, 0, 0]),
      uv: [
        numberOf(uvRaw[0], 0),
        numberOf(uvRaw[1], 0),
        Math.max(0.01, numberOf(uvRaw[2], 0.2)),
        Math.max(0.01, numberOf(uvRaw[3], 0.2)),
      ],
    });
  });
  return parts.length > 0 ? { parts } : undefined;
}

function normalizeUvLayout(raw: unknown): UvIsland[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const islands: UvIsland[] = [];
  raw.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const island = entry as Record<string, unknown>;
    islands.push({
      name: typeof island.name === 'string' && island.name.trim() ? island.name.trim() : 'PART',
      x: numberOf(island.x, 0),
      y: numberOf(island.y, 0),
      w: Math.max(0.01, numberOf(island.w, 0.2)),
      h: Math.max(0.01, numberOf(island.h, 0.2)),
    });
  });
  return islands.length > 0 ? islands : undefined;
}

function normalizeCanvas(raw: unknown, fallback: { width: number; height: number; background: string }) {
  const source = (raw ?? {}) as Record<string, unknown>;
  return {
    width: clampDimension(numberOf(source.width, fallback.width)),
    height: clampDimension(numberOf(source.height, fallback.height)),
    background: typeof source.background === 'string' ? source.background : fallback.background,
  };
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

export const BLUEPRINT_SCHEMA_VERSION = 3;

const PRIORITIES = ['low', 'medium', 'high'] as const;

function normalizeReferences(raw: unknown): BlueprintReference[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: BlueprintReference[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const ref = entry as Record<string, unknown>;
    out.push({
      url: typeof ref.url === 'string' ? ref.url : undefined,
      dataUrl: typeof ref.dataUrl === 'string' ? ref.dataUrl : undefined,
      caption: typeof ref.caption === 'string' ? ref.caption : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

/** Validation with a report: errors block the import, warnings allow it. */
export function validateBlueprintReport(value: unknown): { blueprint: SceneBlueprint | null; report: ValidationReport } {
  const report: ValidationReport = { errors: [], warnings: [] };
  if (!value || typeof value !== 'object') {
    report.errors.push('Kein gültiges JSON-Objekt.');
    return { blueprint: null, report };
  }
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.assets) && !Array.isArray(raw.maps)) {
    report.errors.push('Weder "assets" noch "maps" vorhanden.');
    return { blueprint: null, report };
  }
  if (raw.kind !== undefined && !KINDS.includes(raw.kind as SetKind)) {
    report.warnings.push(`Unbekanntes "kind" (${String(raw.kind)}) — verwende "scene".`);
  }
  if (raw.target !== undefined && !ENGINES.includes(raw.target as EngineTarget)) {
    report.warnings.push(`Unbekanntes "target" (${String(raw.target)}) — wird ignoriert.`);
  }

  let kind: SetKind = KINDS.includes(raw.kind as SetKind) ? (raw.kind as SetKind) : 'scene';
  if (raw.kind === undefined && Array.isArray(raw.maps) && raw.maps.length > 0) kind = 'model';

  const canvas = normalizeCanvas(
    raw.canvas,
    kind === 'model' ? { ...DEFAULT_MODEL_CANVAS } : { width: 960, height: 540, background: '#0b0d12' },
  );

  const assets: SceneBlueprint['assets'] = [];
  if (Array.isArray(raw.assets)) {
    raw.assets.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || !(entry as Record<string, unknown>).title) {
        report.warnings.push(`Asset ${index + 1}: kein "title" — übersprungen.`);
        return;
      }
      const asset = entry as Record<string, unknown>;
      const title = String(asset.title).trim() || `Asset ${index + 1}`;
      const dimsRaw = (asset.dimensions ?? {}) as Record<string, unknown>;
      const layoutRaw = (asset.layout ?? {}) as Record<string, unknown>;
      if (asset.type !== undefined && !TYPES.includes(asset.type as TicketType)) {
        report.warnings.push(`"${title}": unbekannter "type" (${String(asset.type)}) — verwende "prop".`);
      }
      if (asset.map !== undefined && !MAP_TYPES.includes(asset.map as MapType)) {
        report.warnings.push(`"${title}": unbekannter "map" (${String(asset.map)}) — wird ignoriert.`);
      }
      const type = TYPES.includes(asset.type as TicketType) ? (asset.type as TicketType) : 'prop';
      const background = BACKGROUNDS.includes(asset.background as BackgroundKind)
        ? (asset.background as BackgroundKind)
        : 'transparent';
      const status = STATUSES.includes(asset.status as TicketStatus)
        ? (asset.status as TicketStatus)
        : 'backlog';
      const map = MAP_TYPES.includes(asset.map as MapType) ? (asset.map as MapType) : undefined;
      const priority = PRIORITIES.includes(asset.priority as (typeof PRIORITIES)[number])
        ? (asset.priority as (typeof PRIORITIES)[number])
        : undefined;

      const assetEntry: NonNullable<SceneBlueprint['assets']>[number] = {
        id: typeof asset.id === 'string' ? asset.id : undefined,
        title,
        type,
        status,
        map,
        priority,
        purpose: typeof asset.purpose === 'string' ? asset.purpose : undefined,
        acceptanceCriteria: Array.isArray(asset.acceptanceCriteria)
          ? asset.acceptanceCriteria.filter((item): item is string => typeof item === 'string')
          : undefined,
        references: normalizeReferences(asset.references),
        dimensions: {
          width: clampDimension(numberOf(dimsRaw.width, canvas.width)),
          height: clampDimension(numberOf(dimsRaw.height, canvas.height)),
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
      };
      assets.push(assetEntry);
    });
  }

  const maps: SceneBlueprint['maps'] = [];
  if (Array.isArray(raw.maps)) {
    raw.maps.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return;
      const map = entry as Record<string, unknown>;
      if (map.part !== undefined && (typeof map.part !== 'string' || !map.part.trim())) {
        report.errors.push(`Map ${index + 1}: "part" muss ein nichtleerer UV-Bereichsname sein.`);
      }
      if (map.map === undefined || !MAP_TYPES.includes(map.map as MapType)) {
        report.warnings.push(`Map ${index + 1}: unbekannter "map"-Wert (${String(map.map)}) — verwende "other".`);
      }
      const mapType = MAP_TYPES.includes(map.map as MapType) ? (map.map as MapType) : 'other';
      const dimsRaw = (map.dimensions ?? {}) as Record<string, unknown>;
      const priority = PRIORITIES.includes(map.priority as (typeof PRIORITIES)[number])
        ? (map.priority as (typeof PRIORITIES)[number])
        : undefined;
      const mapEntry: NonNullable<SceneBlueprint['maps']>[number] = {
        id: typeof map.id === 'string' ? map.id : undefined,
        map: mapType,
        part: typeof map.part === 'string' && map.part.trim() ? map.part.trim() : undefined,
        title: typeof map.title === 'string' ? map.title : undefined,
        brief: typeof map.brief === 'string' ? map.brief : '',
        optional: map.optional === true,
        priority,
        purpose: typeof map.purpose === 'string' ? map.purpose : undefined,
        acceptanceCriteria: Array.isArray(map.acceptanceCriteria)
          ? map.acceptanceCriteria.filter((item): item is string => typeof item === 'string')
          : undefined,
        references: normalizeReferences(map.references),
        dimensions: {
          width: clampDimension(numberOf(dimsRaw.width, canvas.width)),
          height: clampDimension(numberOf(dimsRaw.height, canvas.height)),
        },
        background: BACKGROUNDS.includes(map.background as BackgroundKind)
          ? (map.background as BackgroundKind)
          : mapDefaultBackground(mapType),
      };
      maps.push(mapEntry);
    });
  }

  if (assets.length === 0 && maps.length === 0) {
    report.errors.push('Keine gültigen Assets/Maps gefunden.');
    return { blueprint: null, report };
  }
  if (assets.length + maps.length > 200) {
    report.errors.push('Zu viele Einträge (max. 200).');
    return { blueprint: null, report };
  }

  const mesh = normalizeMesh(raw.mesh);
  const modelUrl = typeof raw.modelUrl === 'string' ? raw.modelUrl : undefined;
  const uvLayout = normalizeUvLayout(raw.uvLayout);
  const target = ENGINES.includes(raw.target as EngineTarget) ? (raw.target as EngineTarget) : undefined;

  const mapsWithParts = maps.filter((map) => map.part);
  if (mapsWithParts.length > 0) {
    if (kind !== 'model') {
      report.errors.push('Map-"part" ist nur für Modell-Blueprints erlaubt.');
    }
    if (mapsWithParts.length !== maps.length) {
      report.errors.push('Bei Modellteil-Tickets muss jede Map genau einem "part" zugeordnet sein.');
    }
    if (!uvLayout?.length) {
      report.errors.push('Modellteil-Tickets benötigen ein "uvLayout" mit einem Bereich pro Teil.');
    } else {
      const layoutByName = new Map<string, UvIsland>();
      for (const island of uvLayout) {
        if (layoutByName.has(island.name)) {
          report.errors.push(`Der uvLayout-Name "${island.name}" ist mehrfach vorhanden.`);
        }
        if (island.x < 0 || island.y < 0 || island.x + island.w > 1 || island.y + island.h > 1) {
          report.errors.push(`UV-Bereich "${island.name}" muss vollständig innerhalb des 0–1-Atlas liegen.`);
        }
        layoutByName.set(island.name, island);
      }
      const seenPartMaps = new Set<string>();
      for (const map of mapsWithParts) {
        const island = layoutByName.get(map.part!);
        if (!island) {
          report.errors.push(`Map "${map.map}": part "${map.part}" fehlt im uvLayout.`);
          continue;
        }
        const key = `${map.part}:${map.map}`;
        if (seenPartMaps.has(key)) {
          report.errors.push(`Map "${map.map}" ist für Teil "${map.part}" mehrfach vorhanden.`);
        }
        seenPartMaps.add(key);

        if (mesh) {
          const meshPart = mesh.parts.find((part) => part.name === map.part);
          if (!meshPart) {
            report.errors.push(`UV-Bereich "${map.part}" benötigt ein gleichnamiges mesh.parts[].name.`);
            continue;
          }
          const [x, y, width, height] = meshPart.uv;
          if (
            Math.abs(x - island.x) > 0.001 ||
            Math.abs(y - island.y) > 0.001 ||
            Math.abs(width - island.w) > 0.001 ||
            Math.abs(height - island.h) > 0.001
          ) {
            report.errors.push(`UV-Bereich "${map.part}" muss mit dem uv-Rechteck seines Mesh-Teils übereinstimmen.`);
          }
        }
      }
      if (modelUrl && !mesh) {
        report.warnings.push('Bei einem Modellteil-Blueprint müssen die Mesh-Namen im GLB exakt zu uvLayout und Map-"part" passen.');
      }
    }
  }

  if (kind === 'model') {
    if (!target) report.warnings.push('Modell ohne "target" (unreal|unity|gltf).');
    if (!modelUrl && !mesh && !uvLayout) {
      report.warnings.push('Modell ohne "modelUrl"/"mesh"/"uvLayout" — die 3D-Vorschau bleibt leer.');
    }
  }

  const blueprint: SceneBlueprint = {
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : undefined,
    id: typeof raw.id === 'string' ? raw.id : undefined,
    action: raw.action === 'create' || raw.action === 'upsert' ? raw.action : undefined,
    kind,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : t('fallback.group'),
    description: typeof raw.description === 'string' ? raw.description : '',
    artDirection: typeof raw.artDirection === 'string' ? raw.artDirection : '',
    target,
    uvTemplate: typeof raw.uvTemplate === 'string' ? raw.uvTemplate : undefined,
    uvLayout,
    mesh,
    modelUrl,
    modelName: typeof raw.modelName === 'string' ? raw.modelName : undefined,
    canvas,
    assets,
    maps,
  };
  return { blueprint, report };
}

/** Convenience wrapper: returns the blueprint only when there are no blocking errors. */
export function validateBlueprint(value: unknown): SceneBlueprint | null {
  const { blueprint, report } = validateBlueprintReport(value);
  return report.errors.length === 0 ? blueprint : null;
}
