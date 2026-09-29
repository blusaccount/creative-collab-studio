import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BackgroundKind, Project, StudioSettings, Ticket, TicketStatus, TicketType } from '../types';
import { DEFAULT_DIMENSIONS } from '../types';
import { createDefaultLayerStates } from '../drawing/factory';
import { createId } from '../utils/id';
import {
  DEFAULT_SETTINGS,
  bootstrapStudio,
  persistProject,
  persistSettings,
  persistTicket,
  removeProject,
  removeTicket,
} from '../storage/repository';

export interface NewTicketInput {
  title: string;
  description: string;
  type: TicketType;
  status: TicketStatus;
  dimensions: { width: number; height: number };
  background: BackgroundKind;
}

export interface NewProjectInput {
  name: string;
  assetOutputFolder: string;
  defaultDimensions: { width: number; height: number };
}

export function useStudio() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    bootstrapStudio()
      .then((snapshot) => {
        setProjects(snapshot.projects);
        setTickets(snapshot.tickets);
        setSettings(snapshot.settings);
        const storedProject = snapshot.settings.lastProjectId;
        const project =
          snapshot.projects.find((item) => item.id === storedProject) ?? snapshot.projects[0];
        setActiveProjectId(project?.id ?? '');
        const projectTickets = snapshot.tickets.filter((ticket) => ticket.projectId === project?.id);
        const storedTicket = snapshot.settings.lastTicketId;
        const ticket =
          projectTickets.find((item) => item.id === storedTicket) ??
          [...projectTickets].sort((a, b) => a.order - b.order)[0];
        setActiveTicketId(ticket?.id ?? null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load studio data');
      })
      .finally(() => setLoading(false));
  }, []);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null,
    [projects, activeProjectId],
  );

  const projectTickets = useMemo(() => {
    if (!activeProject) return [];
    return tickets
      .filter((ticket) => ticket.projectId === activeProject.id)
      .sort((a, b) => a.order - b.order);
  }, [tickets, activeProject]);

  const activeTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === activeTicketId) ?? null,
    [tickets, activeTicketId],
  );

  const updateSettings = useCallback((patch: Partial<StudioSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      persistSettings(next).catch((err) => setError(String(err)));
      return next;
    });
  }, []);

  const selectProject = useCallback(
    (projectId: string) => {
      setActiveProjectId(projectId);
      updateSettings({ lastProjectId: projectId });
      const first = tickets
        .filter((ticket) => ticket.projectId === projectId)
        .sort((a, b) => a.order - b.order)[0];
      setActiveTicketId(first?.id ?? null);
      if (first) updateSettings({ lastTicketId: first.id });
    },
    [tickets, updateSettings],
  );

  const createProject = useCallback(
    async (input: NewProjectInput) => {
      const now = Date.now();
      const project: Project = {
        id: createId('project'),
        name: input.name.trim() || 'Untitled project',
        assetOutputFolder: input.assetOutputFolder.trim() || 'creative-collab-output',
        defaultDimensions: input.defaultDimensions,
        createdAt: now,
        updatedAt: now,
      };
      setProjects((current) => [...current, project]);
      setActiveProjectId(project.id);
      updateSettings({ lastProjectId: project.id });
      setActiveTicketId(null);
      await persistProject(project);
      return project;
    },
    [updateSettings],
  );

  const updateProject = useCallback(
    async (id: string, patch: Partial<Project>) => {
      const existing = projects.find((project) => project.id === id);
      if (!existing) return;
      const updated: Project = { ...existing, ...patch, updatedAt: Date.now() };
      setProjects((current) => current.map((project) => (project.id === id ? updated : project)));
      await persistProject(updated);
    },
    [projects],
  );

  const deleteProject = useCallback(
    async (id: string) => {
      await removeProject(id);
      const remainingProjects = projects.filter((project) => project.id !== id);
      const remainingTickets = tickets.filter((ticket) => ticket.projectId !== id);
      setProjects(remainingProjects);
      setTickets(remainingTickets);
      if (id === activeProjectId) {
        const nextProject = remainingProjects[0];
        setActiveProjectId(nextProject?.id ?? '');
        const firstTicket = remainingTickets
          .filter((ticket) => ticket.projectId === nextProject?.id)
          .sort((a, b) => a.order - b.order)[0];
        setActiveTicketId(firstTicket?.id ?? null);
      }
    },
    [projects, tickets, activeProjectId],
  );

  const createTicket = useCallback(
    async (input: NewTicketInput, projectId: string) => {
      const now = Date.now();
      const maxOrder = tickets
        .filter((ticket) => ticket.projectId === projectId)
        .reduce((max, ticket) => Math.max(max, ticket.order), -1);
      const ticket: Ticket = {
        id: createId('ticket'),
        projectId,
        title: input.title.trim() || 'Untitled asset',
        description: input.description.trim(),
        type: input.type,
        status: input.status,
        dimensions: input.dimensions,
        order: maxOrder + 1,
        notes: [],
        layers: createDefaultLayerStates(),
        background: input.background,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      setTickets((current) => [...current, ticket]);
      setActiveTicketId(ticket.id);
      updateSettings({ lastTicketId: ticket.id });
      await persistTicket(ticket);
      return ticket;
    },
    [tickets, updateSettings],
  );

  const updateTicket = useCallback(
    async (id: string, patch: Partial<Ticket>, options?: { touch?: boolean }) => {
      const existing = tickets.find((ticket) => ticket.id === id);
      if (!existing) return;
      const updated: Ticket = {
        ...existing,
        ...patch,
        updatedAt: options?.touch === false ? existing.updatedAt : Date.now(),
      };
      setTickets((current) => current.map((ticket) => (ticket.id === id ? updated : ticket)));
      await persistTicket(updated);
    },
    [tickets],
  );

  const deleteTicket = useCallback(
    async (id: string) => {
      const ticket = tickets.find((item) => item.id === id);
      await removeTicket(id);
      setTickets((current) => current.filter((item) => item.id !== id));
      if (activeTicketId === id && ticket) {
        const remaining = tickets
          .filter((item) => item.projectId === ticket.projectId && item.id !== id)
          .sort((a, b) => a.order - b.order);
        setActiveTicketId(remaining[0]?.id ?? null);
      }
    },
    [tickets, activeTicketId],
  );

  const selectTicket = useCallback(
    (id: string) => {
      setActiveTicketId(id);
      updateSettings({ lastTicketId: id });
    },
    [updateSettings],
  );

  const reorderTickets = useCallback(
    async (projectId: string, orderedIds: string[]) => {
      const now = Date.now();
      const updates: Ticket[] = [];
      setTickets((current) =>
        current.map((ticket) => {
          if (ticket.projectId !== projectId) return ticket;
          const order = orderedIds.indexOf(ticket.id);
          if (order === -1 || order === ticket.order) return ticket;
          const next = { ...ticket, order, updatedAt: now };
          updates.push(next);
          return next;
        }),
      );
      await Promise.all(updates.map((ticket) => persistTicket(ticket)));
    },
    [],
  );

  const addNote = useCallback(
    async (ticketId: string, body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;
      const ticket = tickets.find((item) => item.id === ticketId);
      if (!ticket) return;
      const note = {
        id: createId('note'),
        body: trimmed,
        author: 'Artist',
        createdAt: Date.now(),
      };
      await updateTicket(ticketId, { notes: [...ticket.notes, note] });
    },
    [tickets, updateTicket],
  );

  const addRecentColor = useCallback(
    (color: string) => {
      setSettings((current) => {
        const next = {
          ...current,
          recentColors: [color, ...current.recentColors.filter((item) => item !== color)].slice(0, 18),
        };
        persistSettings(next).catch((err) => setError(String(err)));
        return next;
      });
    },
    [],
  );

  return {
    loading,
    error,
    clearError: () => setError(null),
    projects,
    tickets,
    projectTickets,
    settings,
    activeProject,
    activeProjectId,
    activeTicket,
    activeTicketId,
    defaultDimensions: activeProject?.defaultDimensions ?? DEFAULT_DIMENSIONS,
    selectProject,
    createProject,
    updateProject,
    deleteProject,
    selectTicket,
    createTicket,
    updateTicket,
    deleteTicket,
    reorderTickets,
    addNote,
    updateSettings,
    addRecentColor,
  };
}

export type StudioController = ReturnType<typeof useStudio>;
