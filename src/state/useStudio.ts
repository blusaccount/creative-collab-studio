import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BackgroundKind,
  Project,
  Scene,
  SceneBlueprint,
  StudioSettings,
  Ticket,
  TicketStatus,
  TicketType,
} from '../types';
import { DEFAULT_DIMENSIONS } from '../types';
import { createDefaultLayerStates } from '../drawing/factory';
import { buildSceneFromBlueprint } from '../scenes/build';
import { t } from '../i18n';
import { createId } from '../utils/id';
import {
  DEFAULT_SETTINGS,
  bootstrapStudio,
  persistProject,
  persistScene,
  persistSettings,
  persistTicket,
  persistTickets,
  removeProject,
  removeScene,
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
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    bootstrapStudio()
      .then((snapshot) => {
        setProjects(snapshot.projects);
        setTickets(snapshot.tickets);
        setScenes(snapshot.scenes);
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
        const projectScenes = snapshot.scenes.filter((scene) => scene.projectId === project?.id);
        const storedScene = snapshot.settings.lastSceneId;
        const scene = projectScenes.find((item) => item.id === storedScene) ?? projectScenes[0];
        setActiveSceneId(scene?.id ?? null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('toast.loadFailed'));
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

  const projectScenes = useMemo(() => {
    if (!activeProject) return [];
    return scenes
      .filter((scene) => scene.projectId === activeProject.id)
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [scenes, activeProject]);

  const activeScene = useMemo(
    () => scenes.find((scene) => scene.id === activeSceneId) ?? null,
    [scenes, activeSceneId],
  );

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const updateSettings = useCallback((patch: Partial<StudioSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    persistSettings(next).catch((err) => setError(String(err)));
  }, []);

  const selectScene = useCallback(
    (id: string | null) => {
      setActiveSceneId(id);
      updateSettings({ lastSceneId: id ?? undefined });
    },
    [updateSettings],
  );

  const importBlueprint = useCallback(
    async (
      blueprint: SceneBlueprint,
      projectId?: string,
      decorate?: (ticket: Ticket, index: number) => Partial<Ticket>,
    ) => {
      const targetProject = projectId ?? activeProject?.id;
      if (!targetProject) return null;
      const baseOrder =
        tickets
          .filter((ticket) => ticket.projectId === targetProject)
          .reduce((max, ticket) => Math.max(max, ticket.order), -1) + 1;
      const built = buildSceneFromBlueprint(blueprint, targetProject, baseOrder);
      const scene = built.scene;

      // Idempotent upsert: a blueprint with an existing scene id updates that
      // scene and its tickets instead of duplicating the whole set.
      const existing = blueprint.id ? scenes.find((item) => item.id === blueprint.id) : undefined;
      if (existing) {
        const prevById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
        const merged = built.tickets.map((ticket) => {
          const prev = prevById.get(ticket.id);
          if (!prev) return ticket;
          return {
            ...prev,
            title: ticket.title,
            description: ticket.description,
            type: ticket.type,
            dimensions: ticket.dimensions,
            background: ticket.background,
            mapType: ticket.mapType,
            materialChannels: ticket.materialChannels,
            modelPart: ticket.modelPart,
            updatedAt: Date.now(),
          } as Ticket;
        });
        const updatedScene: Scene = {
          ...existing,
          kind: scene.kind,
          name: scene.name,
          description: scene.description,
          artDirection: scene.artDirection,
          target: scene.target,
          uvTemplate: scene.uvTemplate,
          uvLayout: scene.uvLayout,
          mesh: scene.mesh,
          modelFile: scene.modelFile ?? existing.modelFile,
          canvas: scene.canvas,
          items: scene.items,
          updatedAt: Date.now(),
        };
        setScenes((current) => current.map((item) => (item.id === updatedScene.id ? updatedScene : item)));
        setTickets((current) => {
          const map = new Map(current.map((ticket) => [ticket.id, ticket]));
          merged.forEach((ticket) => map.set(ticket.id, ticket));
          return [...map.values()];
        });
        setActiveSceneId(updatedScene.id);
        updateSettings({ lastSceneId: updatedScene.id });
        await persistScene(updatedScene);
        await persistTickets(merged);
        return updatedScene;
      }

      const generated = decorate
        ? built.tickets.map((ticket, index) => ({ ...ticket, ...decorate(ticket, index) }))
        : built.tickets;
      setScenes((current) => [...current, scene]);
      setTickets((current) => [...current, ...generated]);
      setActiveSceneId(scene.id);
      updateSettings({ lastSceneId: scene.id });
      if (generated[0]) {
        setActiveTicketId(generated[0].id);
        updateSettings({ lastTicketId: generated[0].id });
      }
      await persistScene(scene);
      await persistTickets(generated);
      return scene;
    },
    [activeProject, tickets, scenes, updateSettings],
  );

  const deleteScene = useCallback(
    async (id: string) => {
      const scene = scenes.find((item) => item.id === id);
      if (!scene) return;
      const sceneTicketIds = new Set<string>([
        ...scene.items.map((item) => item.ticketId),
        ...tickets.filter((ticket) => ticket.sceneId === id).map((ticket) => ticket.id),
      ]);
      await Promise.all([...sceneTicketIds].map((ticketId) => removeTicket(ticketId)));
      await removeScene(id);
      setScenes((current) => current.filter((item) => item.id !== id));
      setTickets((current) => current.filter((ticket) => !sceneTicketIds.has(ticket.id)));
      if (activeSceneId === id) {
        const remaining = scenes.filter((item) => item.id !== id && item.projectId === scene.projectId);
        setActiveSceneId(remaining[0]?.id ?? null);
      }
      if (activeTicketId && sceneTicketIds.has(activeTicketId)) {
        setActiveTicketId(null);
      }
    },
    [scenes, tickets, activeSceneId, activeTicketId],
  );

  const completeScene = useCallback(
    async (id: string) => {
      const scene = scenes.find((item) => item.id === id);
      if (!scene) return;
      const updated: Scene = { ...scene, completedAt: Date.now(), updatedAt: Date.now() };
      setScenes((current) => current.map((item) => (item.id === id ? updated : item)));
      await persistScene(updated);
    },
    [scenes],
  );

  const updateScene = useCallback(
    async (id: string, patch: Partial<Scene>) => {
      const existing = scenes.find((scene) => scene.id === id);
      if (!existing) return;
      const updated: Scene = { ...existing, ...patch, updatedAt: Date.now() };
      setScenes((current) => current.map((scene) => (scene.id === id ? updated : scene)));
      await persistScene(updated);
    },
    [scenes],
  );

  const selectProject = useCallback(
    (projectId: string) => {
      setActiveProjectId(projectId);
      updateSettings({ lastProjectId: projectId });
      const first = tickets
        .filter((ticket) => ticket.projectId === projectId)
        .sort((a, b) => a.order - b.order)[0];
      setActiveTicketId(first?.id ?? null);
      if (first) updateSettings({ lastTicketId: first.id });
      const firstScene = scenes
        .filter((scene) => scene.projectId === projectId)
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      setActiveSceneId(firstScene?.id ?? null);
    },
    [tickets, scenes, updateSettings],
  );

  const createProject = useCallback(
    async (input: NewProjectInput) => {
      const now = Date.now();
      const project: Project = {
        id: createId('project'),
        name: input.name.trim() || t('fallback.project'),
        assetOutputFolder: input.assetOutputFolder.trim() || 'creative-collab-output',
        defaultDimensions: input.defaultDimensions,
        createdAt: now,
        updatedAt: now,
      };
      setProjects((current) => [...current, project]);
      setActiveProjectId(project.id);
      updateSettings({ lastProjectId: project.id });
      setActiveTicketId(null);
      setActiveSceneId(null);
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
      setScenes((current) => current.filter((scene) => scene.projectId !== id));
      if (id === activeProjectId) {
        const nextProject = remainingProjects[0];
        setActiveProjectId(nextProject?.id ?? '');
        const firstTicket = remainingTickets
          .filter((ticket) => ticket.projectId === nextProject?.id)
          .sort((a, b) => a.order - b.order)[0];
        const firstScene = scenes
          .filter((scene) => scene.projectId === nextProject?.id)
          .sort((a, b) => a.createdAt - b.createdAt)[0];
        setActiveTicketId(firstTicket?.id ?? null);
        setActiveSceneId(firstScene?.id ?? null);
        updateSettings({
          lastProjectId: nextProject?.id,
          lastTicketId: firstTicket?.id,
          lastSceneId: firstScene?.id,
        });
      }
    },
    [projects, tickets, scenes, activeProjectId, updateSettings],
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
        title: input.title.trim() || t('fallback.asset'),
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

      // Unlink the ticket from every scene that references it (items or sceneId).
      const affectedScenes = scenes.filter(
        (scene) => scene.id === ticket?.sceneId || scene.items.some((item) => item.ticketId === id),
      );
      for (const scene of affectedScenes) {
        const updated: Scene = {
          ...scene,
          items: scene.items.filter((item) => item.ticketId !== id),
          updatedAt: Date.now(),
        };
        setScenes((current) => current.map((item) => (item.id === scene.id ? updated : item)));
        await persistScene(updated);
      }

      if (activeTicketId === id && ticket) {
        const remaining = tickets
          .filter((item) => item.projectId === ticket.projectId && item.id !== id)
          .sort((a, b) => a.order - b.order);
        setActiveTicketId(remaining[0]?.id ?? null);
      }
    },
    [tickets, activeTicketId, scenes],
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
      const next = tickets.map((ticket) => {
        if (ticket.projectId !== projectId) return ticket;
        const order = orderedIds.indexOf(ticket.id);
        if (order === -1 || order === ticket.order) return ticket;
        const updated = { ...ticket, order, updatedAt: now };
        updates.push(updated);
        return updated;
      });
      if (updates.length === 0) return;
      setTickets(next);
      await Promise.all(updates.map((ticket) => persistTicket(ticket)));
    },
    [tickets],
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
        author: t('notes.author'),
        createdAt: Date.now(),
      };
      await updateTicket(ticketId, { notes: [...ticket.notes, note] });
    },
    [tickets, updateTicket],
  );

  const addRecentColor = useCallback(
    (color: string) => {
      const current = settingsRef.current;
      const next: StudioSettings = {
        ...current,
        recentColors: [color, ...current.recentColors.filter((item) => item !== color)].slice(0, 18),
      };
      settingsRef.current = next;
      setSettings(next);
      persistSettings(next).catch((err) => setError(String(err)));
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    loading,
    error,
    clearError,
    projects,
    tickets,
    projectTickets,
    scenes,
    projectScenes,
    activeScene,
    activeSceneId,
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
    importBlueprint,
    deleteScene,
    selectScene,
    completeScene,
    updateScene,
  };
}

export type StudioController = ReturnType<typeof useStudio>;
