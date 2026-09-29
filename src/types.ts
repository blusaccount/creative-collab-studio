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

export interface Project {
  id: string;
  name: string;
  assetOutputFolder: string;
  defaultDimensions: { width: number; height: number };
  createdAt: number;
  updatedAt: number;
}

export interface StudioSettings {
  recentColors: string[];
  theme: 'dark' | 'light';
  lastProjectId?: string;
  lastTicketId?: string;
  fileNamingTemplate: string;
  useVersionSuffix: boolean;
}

export interface StudioMeta {
  id: 'meta';
  schemaVersion: number;
  settings: StudioSettings;
}

export type Tool = 'brush' | 'eraser' | 'fill' | 'eyedropper' | 'pan';

export type BrushPreset = 'hard' | 'soft' | 'textured';

export interface BrushSettings {
  tool: Tool;
  preset: BrushPreset;
  color: string;
  size: number;
  opacity: number;
  hardness: number;
}

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
  gridSize: number;
  showReferences: boolean;
}

export const DEFAULT_DIMENSIONS = { width: 512, height: 512 };

export const STATUS_LABEL: Record<TicketStatus, string> = {
  backlog: 'Backlog',
  'in-progress': 'In progress',
  'review-ready': 'Review ready',
  complete: 'Complete',
  archived: 'Archived',
};

export const TICKET_TYPES: TicketType[] = [
  'texture',
  'prop',
  'ui',
  'concept',
  'effect',
  'character',
  'other',
];

export const BACKGROUND_LABEL: Record<BackgroundKind, string> = {
  white: 'White',
  transparent: 'Transparent',
  dark: 'Dark',
  paper: 'Paper',
};
