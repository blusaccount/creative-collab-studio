export type TicketStatus = 'backlog' | 'in-progress' | 'review-ready' | 'complete' | 'archived';

export type TicketType =
  | 'texture'
  | 'prop'
  | 'ui'
  | 'concept'
  | 'effect'
  | 'character'
  | 'other';

export type LayerKind = 'draw' | 'reference';

export type BackgroundKind = 'white' | 'transparent' | 'dark' | 'paper';

export interface LayerState {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  opacity: number;
  locked: boolean;
  /** PNG data URL. Empty string means a blank layer. */
  dataUrl: string;
}

export interface Note {
  id: string;
  body: string;
  author: string;
  createdAt: number;
}

export interface Ticket {
  id: string;
  projectId: string;
  /** Optional group (scene or model) this ticket belongs to. */
  sceneId?: string;
  /** 3D texture map type when the ticket belongs to a model set. */
  mapType?: MapType;
  /** Maps managed together on one model ticket instead of as separate tickets. */
  materialChannels?: SceneBlueprintMap[];
  /** Paint layers for non-basecolor material channels. BaseColor uses `layers`. */
  materialMapLayers?: Partial<Record<MapType, LayerState[]>>;
  /** The UV region represented by this model-part ticket, in the group's atlas space. */
  modelPart?: UvIsland;
  /** The id the AI gave this entry in its blueprint (used to match on re-import). */
  blueprintAssetId?: string;
  priority?: 'low' | 'medium' | 'high';
  /** "Done when" checklist from the AI blueprint. */
  acceptanceCriteria?: string[];
  title: string;
  description: string;
  type: TicketType;
  status: TicketStatus;
  dimensions: { width: number; height: number };
  order: number;
  notes: Note[];
  layers: LayerState[];
  background: BackgroundKind;
  version: number;
  /** Signature of the artwork at the last export, so exports don't inflate the version. */
  lastExportHash?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  archivedAt?: number;
}

/** A placed asset inside a scene layout. References a ticket for its artwork. */
export interface SceneItem {
  id: string;
  ticketId: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
}

/** A UV island in normalised (0–1) texture space. */
export interface UvIsland {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A primitive part of a procedural preview mesh. `uv` = [x, y, w, h] in the texture. */
export interface MeshPart {
  name?: string;
  shape: 'box' | 'cylinder' | 'sphere';
  size?: [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  uv: [number, number, number, number];
}

/** A procedural, file-less model mesh the AI can describe in a blueprint. */
export interface MeshSpec {
  parts: MeshPart[];
}

/** A "group" — either a spatial 2D scene or a 3D model's texture set. */
export type SetKind = 'scene' | 'model';

export type EngineTarget = 'unreal' | 'unity' | 'gltf';

export type MapType =
  | 'basecolor'
  | 'normal'
  | 'roughness'
  | 'metallic'
  | 'ao'
  | 'emissive'
  | 'opacity'
  | 'height'
  | 'packed'
  | 'other';

export interface Scene {
  id: string;
  projectId: string;
  /** The id the AI gave this blueprint (used to update instead of duplicate on re-import). */
  blueprintId?: string;
  kind: SetKind;
  name: string;
  description: string;
  artDirection: string;
  canvas: { width: number; height: number; background: string };
  items: SceneItem[];
  /** Model sets: target engine + shared UV reference + optional model file/preview. */
  target?: EngineTarget;
  uvTemplate?: string;
  /** Optional UV island layout (enables a matching procedural preview mesh). */
  uvLayout?: UvIsland[];
  /** Optional procedural mesh so the preview shows the model without a file. */
  mesh?: MeshSpec;
  modelFile?: { name: string; url?: string; dataUrl?: string };
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface BlueprintReference {
  url?: string;
  dataUrl?: string;
  caption?: string;
}

/** A production plan authored by the AI assistant and imported into the tool. */
export interface SceneBlueprint {
  schemaVersion?: number;
  /** Stable id → enables idempotent upsert instead of duplication. */
  id?: string;
  action?: 'create' | 'upsert';
  kind?: SetKind;
  name: string;
  description: string;
  artDirection: string;
  target?: EngineTarget;
  uvTemplate?: string;
  uvLayout?: UvIsland[];
  /** Optional procedural mesh (primitives + UV) — a file-less model. */
  mesh?: MeshSpec;
  /** Optional URL of the model mesh (.glb) so the preview shows the real asset. */
  modelUrl?: string;
  modelName?: string;
  canvas?: { width: number; height: number; background: string };
  /** Scene blueprints use `assets`; model blueprints may use `maps` (or `assets`). */
  assets?: SceneBlueprintAsset[];
  maps?: SceneBlueprintMap[];
}

export interface SceneBlueprintAsset {
  id?: string;
  title: string;
  type: TicketType;
  status?: TicketStatus;
  map?: MapType;
  priority?: 'low' | 'medium' | 'high';
  purpose?: string;
  acceptanceCriteria?: string[];
  references?: BlueprintReference[];
  dimensions: { width: number; height: number };
  background: BackgroundKind;
  brief: string;
  layout: { x: number; y: number; width: number; height: number; layer: number };
}

export interface SceneBlueprintMap {
  id?: string;
  map: MapType;
  /** Optional mesh/UV-island name; matching channels become a separate part ticket. */
  part?: string;
  title?: string;
  brief?: string;
  optional?: boolean;
  priority?: 'low' | 'medium' | 'high';
  purpose?: string;
  acceptanceCriteria?: string[];
  references?: BlueprintReference[];
  dimensions?: { width: number; height: number };
  background?: BackgroundKind;
}

export interface Project {
  id: string;
  name: string;
  assetOutputFolder: string;
  defaultDimensions: { width: number; height: number };
  createdAt: number;
  updatedAt: number;
}

export type Language = 'de' | 'en';

export interface StudioSettings {
  recentColors: string[];
  theme: 'dark' | 'light';
  language: Language;
  lastProjectId?: string;
  lastTicketId?: string;
  lastSceneId?: string;
  fileNamingTemplate: string;
  useVersionSuffix: boolean;
  /** Trim transparent borders when exporting assets. */
  trimOnExport: boolean;
  /** Guard so the bundled demo scene is only auto-loaded once. */
  demoSceneImported?: boolean;
}

export interface StudioMeta {
  id: 'meta';
  schemaVersion: number;
  settings: StudioSettings;
}

export type Tool =
  | 'pencil'
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'text'
  | 'eyedropper'
  | 'magnifier'
  | 'pan'
  | 'line'
  | 'curve'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'roundRect'
  | 'polygon';

export const SHAPE_TOOLS: Tool[] = [
  'line',
  'curve',
  'rect',
  'ellipse',
  'triangle',
  'roundRect',
  'polygon',
];

export function isShapeTool(tool: Tool): boolean {
  return SHAPE_TOOLS.includes(tool);
}

export type BrushPreset = 'hard' | 'soft' | 'textured';

/** Which color a shape outline/fill uses ("none" = off). */
export type ShapePaint = 'none' | 'color1' | 'color2';

export interface ToolSettings {
  tool: Tool;
  preset: BrushPreset;
  /** Color 1 — foreground. */
  color: string;
  /** Color 2 — background. */
  color2: string;
  size: number;
  opacity: number;
  hardness: number;
  shapeOutline: ShapePaint;
  shapeFill: ShapePaint;
  fontFamily: string;
  fontSize: number;
}

export type GuideShape = 'none' | 'circle' | 'hexagon' | 'diamond';

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
  gridSize: number;
  showReferences: boolean;
  guide: GuideShape;
  showUvOverlay: boolean;
}

export const DEFAULT_DIMENSIONS = { width: 512, height: 512 };

export const TICKET_TYPES: TicketType[] = [
  'texture',
  'prop',
  'ui',
  'concept',
  'effect',
  'character',
  'other',
];

export const TICKET_STATUSES: TicketStatus[] = [
  'backlog',
  'in-progress',
  'review-ready',
  'complete',
  'archived',
];

export const BACKGROUND_KINDS: BackgroundKind[] = ['white', 'transparent', 'dark', 'paper'];
