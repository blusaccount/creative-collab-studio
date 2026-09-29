import type { Project, StudioMeta, StudioSettings, Ticket } from '../types';
import { createSeedProject, createSeedTickets } from '../data/seed';
import { createDefaultLayerStates } from '../drawing/factory';
import {
  STORE_META,
  STORE_PROJECTS,
  STORE_TICKETS,
  deleteRecord,
  deleteTicketsForProject,
  getAllRecords,
  putRecord,
  putRecords,
} from './db';

export const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: StudioSettings = {
  recentColors: ['#111827', '#f8fafc', '#fbbf24', '#f97316', '#a78bfa', '#34d399', '#ef4444'],
  theme: 'dark',
  fileNamingTemplate: '{project}-{title}',
  useVersionSuffix: true,
};

function normalizeTicket(ticket: Ticket): Ticket {
  const layers = ticket.layers && ticket.layers.length > 0 ? ticket.layers : createDefaultLayerStates();
  return {
    ...ticket,
    status: ticket.status ?? 'backlog',
    notes: ticket.notes ?? [],
    layers,
    background: ticket.background ?? 'white',
    version: ticket.version ?? 1,
    order: ticket.order ?? 0,
    updatedAt: ticket.updatedAt ?? ticket.createdAt ?? Date.now(),
    createdAt: ticket.createdAt ?? Date.now(),
  };
}

export interface StudioSnapshot {
  projects: Project[];
  tickets: Ticket[];
  settings: StudioSettings;
}

export async function bootstrapStudio(): Promise<StudioSnapshot> {
  let [projects, tickets, metaRecords] = await Promise.all([
    getAllRecords<Project>(STORE_PROJECTS),
    getAllRecords<Ticket>(STORE_TICKETS),
    getAllRecords<StudioMeta>(STORE_META),
  ]);

  if (projects.length === 0) {
    const project = createSeedProject();
    const seedTickets = createSeedTickets(project.id);
    projects = [project];
    tickets = seedTickets;
    await putRecord(STORE_PROJECTS, project);
    await putRecords(STORE_TICKETS, seedTickets);
  }

  let settings = DEFAULT_SETTINGS;
  const meta = metaRecords.find((item) => item.id === 'meta');
  if (meta) {
    settings = { ...DEFAULT_SETTINGS, ...meta.settings };
  } else {
    await putRecord<StudioMeta>(STORE_META, {
      id: 'meta',
      schemaVersion: SCHEMA_VERSION,
      settings,
    });
  }

  return { projects, tickets: tickets.map(normalizeTicket), settings };
}

export async function persistProject(project: Project): Promise<void> {
  await putRecord(STORE_PROJECTS, project);
}

export async function removeProject(projectId: string): Promise<void> {
  await deleteTicketsForProject(projectId);
  await deleteRecord(STORE_PROJECTS, projectId);
}

export async function persistTicket(ticket: Ticket): Promise<void> {
  await putRecord(STORE_TICKETS, ticket);
}

export async function removeTicket(ticketId: string): Promise<void> {
  await deleteRecord(STORE_TICKETS, ticketId);
}

export async function persistSettings(settings: StudioSettings): Promise<void> {
  await putRecord<StudioMeta>(STORE_META, {
    id: 'meta',
    schemaVersion: SCHEMA_VERSION,
    settings,
  });
}
