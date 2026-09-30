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
  /** Optional scene this ticket belongs to (AI-generated production plan). */
  sceneId?: string;
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

export interface Scene {
  id: string;
  projectId: string;
  name: string;
  description: string;
  artDirection: string;
  canvas: { width: number; height: number; background: string };
  items: SceneItem[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

/** A production plan authored by the AI assistant and imported into the tool. */
export interface SceneBlueprint {
  name: string;
  description: string;
  artDirection: string;
  canvas: { width: number; height: number; background: string };
  assets: SceneBlueprintAsset[];
}

export interface SceneBlueprintAsset {
  title: string;
  type: TicketType;
  status?: TicketStatus;
  dimensions: { width: number; height: number };
  background: BackgroundKind;
  brief: string;
  layout: { x: number; y: number; width: number; height: number; layer: number };
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
