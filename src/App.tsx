import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStudio, type NewProjectInput, type NewTicketInput } from './state/useStudio';
import type { SceneBlueprint, Ticket } from './types';
import { Editor, type EditorHandle } from './components/Editor';
import { TicketQueue } from './components/TicketQueue';
import { GroupList } from './components/GroupList';
import { AssetLibrary } from './components/AssetLibrary';
import { SceneView } from './components/SceneView';
import { ModelBoard } from './components/ModelBoard';
import { NewTicketDialog } from './components/NewTicketDialog';
import { NewProjectDialog } from './components/NewProjectDialog';
import { TicketSettingsDialog } from './components/TicketSettingsDialog';
import { ProjectSettingsDialog } from './components/ProjectSettingsDialog';
import { AiGuideDialog } from './components/AiGuideDialog';
import { BlueprintImportDialog } from './components/BlueprintImportDialog';
import { ConfirmDialog } from './components/Modal';
import { ToastStack, type ToastItem } from './components/Toast';
import { Icon } from './components/Icon';
import { DUNGEON_ENTRANCE_BLUEPRINT } from './data/dungeonScene';
import { generateKnightMapDataUrl, getPlayerKnightBlueprint, getPlayerKnightPaintedBlueprint } from './data/modelDemo';
import { composeTicketBlob } from './drawing/compose';
import { buildAssetFilename, slugify } from './utils/naming';
import { buildProjectState } from './scenes/serialize';
import { downloadBlob } from './utils/download';
import { readFileAsDataUrl } from './utils/psd';
import { createId } from './utils/id';
import { getLanguage, setLanguage, subscribeLanguage, t } from './i18n';

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

type ViewMode = 'editor' | 'scene' | 'library';

function App() {
  const studio = useStudio();
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  const [viewMode, setViewMode] = useState<ViewMode>('editor');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [settingsTicketId, setSettingsTicketId] = useState<string | null>(null);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [groupFilter, setGroupFilter] = useState<string | 'all'>('all');
  // keep the group filter valid across project switches / group deletion
  useEffect(() => {
    setGroupFilter('all');
  }, [studio.activeProjectId]);
  useEffect(() => {
    if (groupFilter !== 'all' && !studio.projectScenes.some((scene) => scene.id === groupFilter)) {
      setGroupFilter('all');
    }
  }, [groupFilter, studio.projectScenes]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const editorRef = useRef<EditorHandle | null>(null);

  const notify = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = createId('toast');
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3800);
  }, []);

  useEffect(() => {
    if (studio.error) {
      notify(studio.error, 'error');
      studio.clearError();
    }
  }, [studio, notify]);

  useEffect(() => {
    document.documentElement.dataset.theme = studio.settings.theme;
  }, [studio.settings.theme]);

  useEffect(() => {
    setLanguage(studio.settings.language);
  }, [studio.settings.language]);

  const settingsTicket =
    settingsTicketId !== null ? studio.tickets.find((ticket) => ticket.id === settingsTicketId) ?? null : null;

  const handleCreateTicket = async (input: NewTicketInput) => {
    if (!studio.activeProject) return;
    await studio.createTicket(input, studio.activeProject.id);
    setShowNewTicket(false);
    setViewMode('editor');
    notify(t('toast.ticketCreated'), 'success');
  };

  const openTicketSettings = (ticket: Ticket) => {
    if (ticket.id !== studio.activeTicketId) {
      studio.selectTicket(ticket.id);
    }
    setSettingsTicketId(ticket.id);
    setViewMode('editor');
  };

  const handleSaveTicketSettings = async (patch: Partial<Ticket>) => {
    if (!settingsTicket) return;
    const snapshot = settingsTicket.id === studio.activeTicketId ? editorRef.current?.flush?.() : null;
    await studio.updateTicket(settingsTicket.id, snapshot ? { ...snapshot, ...patch } : patch);
    setSettingsTicketId(null);
    notify(t('toast.ticketUpdated'), 'success');
  };

  const handleArchiveTicket = async (ticket: Ticket) => {
    await studio.updateTicket(ticket.id, { ...editorRef.current?.flush?.(), status: 'archived', archivedAt: Date.now() });
    setSettingsTicketId(null);
    notify(t('toast.ticketArchived'), 'success');
  };

  const requestDeleteTicket = (ticket: Ticket) => {
    setSettingsTicketId(null);
    setConfirmState({
      title: t('app.confirm.deleteTicket.title'),
      message: t('app.confirm.deleteTicket.body', { title: ticket.title }),
      confirmLabel: t('app.confirm.deleteTicket.confirm'),
      danger: true,
      onConfirm: async () => {
        await studio.deleteTicket(ticket.id);
        setConfirmState(null);
        notify(t('toast.ticketDeleted'), 'success');
      },
    });
  };

  const handleExportTicket = async (ticket: Ticket) => {
    try {
      const blob = await composeTicketBlob(ticket, studio.settings.trimOnExport);
      if (!blob) {
        notify(t('toast.exportFailed'), 'error');
        return;
      }
      downloadBlob(blob, buildAssetFilename(ticket, studio.activeProject, studio.settings));
      await studio.updateTicket(ticket.id, { version: ticket.version + 1 });
      notify(t('toast.exported'), 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : t('toast.exportFailed'), 'error');
    }
  };

  const activeTicketGroup = studio.activeTicket?.sceneId
    ? studio.scenes.find((scene) => scene.id === studio.activeTicket?.sceneId) ?? null
    : null;
  const activeSceneName = activeTicketGroup?.name ?? null;
  const activeUvTemplate = activeTicketGroup?.kind === 'model' ? activeTicketGroup.uvTemplate : undefined;

  const handleLoadDemoScene = () => {
    if (studio.projectScenes.some((scene) => scene.name === DUNGEON_ENTRANCE_BLUEPRINT.name)) {
      notify(t('toast.demoSceneExists'), 'info');
      return;
    }
    void studio.importBlueprint(DUNGEON_ENTRANCE_BLUEPRINT).then((scene) => {
      if (scene) notify(t('toast.sceneLoaded', { count: scene.items.length }), 'success');
    });
  };

  const handleLoadModelDemo = () => {
    const blueprint = getPlayerKnightBlueprint();
    if (studio.projectScenes.some((scene) => scene.name === blueprint.name)) {
      notify(t('toast.demoSceneExists'), 'info');
      return;
    }
    void studio.importBlueprint(blueprint).then((scene) => {
      if (scene) {
        notify(t('toast.groupLoaded', { count: scene.items.length }), 'success');
        setViewMode('scene');
      }
    });
  };

  const paintTicket = (ticket: Ticket, uvTemplate?: string) => {
    const paintMap = ticket.mapType ?? 'basecolor';
    const partName = ticket.modelPart?.name;
    const paint = generateKnightMapDataUrl(paintMap, 1024, partName);
    const layers = ticket.layers.map((layer) =>
      layer.kind === 'reference'
        ? { ...layer, dataUrl: partName ? layer.dataUrl : uvTemplate ?? '' }
        : { ...layer, dataUrl: paint },
    );
    const materialMapLayers = ticket.materialChannels?.length
      ? Object.fromEntries(
          ticket.materialChannels
            .filter((channel) => channel.map !== 'basecolor')
            .map((channel) => [
              channel.map,
              ticket.layers.map((layer) =>
                layer.kind === 'reference'
                  ? { ...layer, dataUrl: partName ? layer.dataUrl : uvTemplate ?? '' }
                  : { ...layer, dataUrl: generateKnightMapDataUrl(channel.map, 1024, partName) },
              ),
            ]),
        )
      : ticket.materialMapLayers;
    return { layers, materialMapLayers, status: 'complete' as const, completedAt: Date.now() };
  };

  const handleExportState = async () => {
    if (!studio.activeProject) return;
    const doc = await buildProjectState(studio.activeProject, studio.scenes, studio.tickets);
    downloadBlob(
      new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
      `${slugify(studio.activeProject.name)}-state.json`,
    );
    notify(t('toast.stateExported'), 'success');
  };

  const handleLoadPaintedKnight = () => {
    const blueprint = getPlayerKnightPaintedBlueprint();
    const existing = studio.projectScenes.find((scene) => scene.name === blueprint.name);
    if (existing) {
      // Repaint the existing example with the current recipe.
      const tickets = studio.projectTickets.filter((ticket) => ticket.sceneId === existing.id);
      void Promise.all(
        tickets.map((ticket) => studio.updateTicket(ticket.id, paintTicket(ticket, blueprint.uvTemplate))),
      ).then(() => {
        studio.selectScene(existing.id);
        setViewMode('scene');
        notify(t('toast.groupLoaded', { count: tickets.length }), 'success');
      });
      return;
    }
    void studio
      .importBlueprint(blueprint, undefined, (ticket) => paintTicket(ticket, blueprint.uvTemplate))
      .then((scene) => {
        if (scene) {
          notify(t('toast.groupLoaded', { count: scene.items.length }), 'success');
          setViewMode('scene');
        }
      });
  };

  const flushEditor = () => {
    const snapshot = editorRef.current?.flush?.();
    if (snapshot && studio.activeTicketId) {
      void studio.updateTicket(studio.activeTicketId, snapshot, { touch: false });
    }
  };

  const handleViewChange = (mode: ViewMode) => {
    if (viewMode === 'editor' && mode !== 'editor') flushEditor();
    setViewMode(mode);
  };

  const handleImportBlueprint = (blueprint: SceneBlueprint) => {
    if (studio.projectScenes.some((scene) => scene.name === blueprint.name)) {
      notify(t('toast.groupExists'), 'info');
      return;
    }
    void studio.importBlueprint(blueprint).then((scene) => {
      if (!scene) return;
      notify(t('toast.blueprintImported', { name: blueprint.name, count: scene.items.length }), 'success');
      setViewMode('scene');
    });
  };

  const handleCreateProject = async (input: NewProjectInput) => {
    await studio.createProject(input);
    setShowNewProject(false);
    setViewMode('editor');
    notify(t('toast.projectCreated'), 'success');
  };

  const handleDeleteProject = () => {
    if (!studio.activeProject) return;
    const project = studio.activeProject;
    setConfirmState({
      title: t('app.confirm.deleteProject.title'),
      message: t('app.confirm.deleteProject.body', { name: project.name }),
      confirmLabel: t('app.confirm.deleteProject.confirm'),
      danger: true,
      onConfirm: async () => {
        await studio.deleteProject(project.id);
        setConfirmState(null);
        notify(t('toast.projectDeleted'), 'success');
      },
    });
  };

  if (studio.loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>{t('app.loading')}</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">CC</div>
          <div>
            <p className="eyebrow">{t('app.eyebrow')}</p>
            <h1>{t('app.title')}</h1>
          </div>
        </div>

        <div className="topbar-center">
          <label className="project-select">
            <Icon name="folder" size={15} />
            <select
              value={studio.activeProjectId}
              onChange={(event) => studio.selectProject(event.target.value)}
            >
              {studio.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="icon-button"
            title={t('app.newProjectTitle')}
            aria-label={t('app.newProjectTitle')}
            onClick={() => setShowNewProject(true)}
          >
            <Icon name="plus" size={16} />
          </button>
          <button
            className="icon-button"
            title={t('app.projectSettingsTitle')}
            aria-label={t('app.projectSettingsTitle')}
            onClick={() => setShowProjectSettings(true)}
          >
            <Icon name="settings" size={16} />
          </button>
        </div>

        <div className="topbar-right">
          <div className="segmented">
            <button className={viewMode === 'editor' ? 'active' : ''} onClick={() => handleViewChange('editor')}>
              <Icon name="brush" size={15} /> {t('app.view.workspace')}
            </button>
            <button className={viewMode === 'scene' ? 'active' : ''} onClick={() => handleViewChange('scene')}>
              <Icon name="layers" size={15} /> {t('app.view.scene')}
            </button>
            <button className={viewMode === 'library' ? 'active' : ''} onClick={() => handleViewChange('library')}>
              <Icon name="image" size={15} /> {t('app.view.assets')}
            </button>
          </div>
          <button
            className="icon-button"
            title={t('scene.pasteFromAi')}
            aria-label={t('scene.pasteFromAi')}
            onClick={() => setShowImport(true)}
          >
            <Icon name="bot" size={16} />
          </button>
          <button
            className="icon-button"
            title={t('app.exportState')}
            aria-label={t('app.exportState')}
            onClick={handleExportState}
          >
            <Icon name="download" size={16} />
          </button>
          <button
            className="icon-button lang-button"
            title={t('app.language')}
            onClick={() => {
              const next = studio.settings.language === 'de' ? 'en' : 'de';
              setLanguage(next);
              studio.updateSettings({ language: next });
            }}
          >
            {language === 'de' ? 'EN' : 'DE'}
          </button>
          <button
            className="icon-button"
            title={t('app.toggleTheme')}
            onClick={() =>
              studio.updateSettings({ theme: studio.settings.theme === 'dark' ? 'light' : 'dark' })
            }
          >
            <Icon name={studio.settings.theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
        </div>
      </header>

      <main className="app-main">
        <GroupList
          groups={studio.projectScenes}
          tickets={studio.projectTickets}
          activeGroupId={groupFilter}
          onSelect={(id) => {
            setGroupFilter(id);
            if (id !== 'all') {
              studio.selectScene(id);
              setViewMode('scene');
            }
          }}
          onOpenGuide={() => setShowImport(true)}
          onLoadModelDemo={handleLoadModelDemo}
          onLoadPaintedDemo={handleLoadPaintedKnight}
        />
        <TicketQueue
          tickets={studio.projectTickets}
          scenes={studio.projectScenes}
          groupFilter={groupFilter}
          activeTicketId={studio.activeTicketId}
          onSelect={(id) => {
            studio.selectTicket(id);
            setViewMode('editor');
          }}
          onReorder={(ids) => studio.activeProject && studio.reorderTickets(studio.activeProject.id, ids)}
          onNewTicket={() => setShowNewTicket(true)}
          onOpenSettings={openTicketSettings}
          onQuickStatus={(ticket, status) => {
            const completedAt =
              status === 'complete' ? ticket.completedAt ?? Date.now() : ticket.completedAt;
            void studio.updateTicket(ticket.id, { status, completedAt });
          }}
        />

        {viewMode === 'editor' ? (
          studio.activeTicket ? (
            <Editor
              key={studio.activeTicket.id}
              ref={editorRef}
              ticket={studio.activeTicket}
              project={studio.activeProject}
              sceneName={activeSceneName}
              uvTemplate={activeUvTemplate}
              modelGroup={activeTicketGroup?.kind === 'model' ? activeTicketGroup : null}
              groupTickets={
                activeTicketGroup
                  ? studio.projectTickets.filter((item) => item.sceneId === activeTicketGroup.id)
                  : []
              }
              onAttachModel={(file) => {
                if (!activeTicketGroup) return;
                void readFileAsDataUrl(file).then((dataUrl) =>
                  studio.updateScene(activeTicketGroup.id, { modelFile: { name: file.name, dataUrl } }),
                );
              }}
              settings={studio.settings}
              onUpdateTicket={studio.updateTicket}
              onAddNote={studio.addNote}
              onAddRecentColor={studio.addRecentColor}
              onOpenSettings={() => openTicketSettings(studio.activeTicket!)}
              onToggleTrim={() => studio.updateSettings({ trimOnExport: !studio.settings.trimOnExport })}
              notify={notify}
            />
          ) : (
            <section className="editor-panel empty">
              <Icon name={studio.activeProject ? 'brush' : 'folder'} size={40} />
              <h2>{studio.activeProject ? t('app.empty.title') : t('app.newProjectTitle')}</h2>
              <p>{studio.activeProject ? t('app.empty.body') : t('newProject.name')}</p>
              {studio.activeProject ? (
                <button className="primary-button" onClick={() => setShowNewTicket(true)}>
                  <Icon name="plus" size={15} /> {t('app.empty.newTicket')}
                </button>
              ) : (
                <button className="primary-button" onClick={() => setShowNewProject(true)}>
                  <Icon name="plus" size={15} /> {t('editor.createProject')}
                </button>
              )}
            </section>
          )
        ) : viewMode === 'scene' ? (
          studio.activeScene?.kind === 'model' ? (
            <ModelBoard
              project={studio.activeProject}
              activeScene={studio.activeScene}
              tickets={studio.projectTickets}
              settings={studio.settings}
              onImportBlueprint={handleImportBlueprint}
              onLoadDemo={handleLoadModelDemo}
              onDeleteScene={(id) => void studio.deleteScene(id)}
              onCompleteScene={(id) => void studio.completeScene(id)}
              onUpdateScene={(id, patch) => void studio.updateScene(id, patch)}
              onOpenTicket={(id) => {
                studio.selectTicket(id);
                setViewMode('editor');
              }}
              onOpenGuide={() => setShowGuide(true)}
              notify={notify}
            />
          ) : (
            <SceneView
              project={studio.activeProject}
              scenes={studio.projectScenes}
              activeScene={studio.activeScene}
              tickets={studio.projectTickets}
              settings={studio.settings}
              onSelectScene={studio.selectScene}
              onSelectGroup={(id) => {
                setGroupFilter(id);
                studio.selectScene(id);
              }}
              onImportBlueprint={handleImportBlueprint}
              onLoadDemo={handleLoadDemoScene}
              onDeleteScene={(id) => void studio.deleteScene(id)}
              onCompleteScene={(id) => void studio.completeScene(id)}
              onOpenTicket={(id) => {
                studio.selectTicket(id);
                setViewMode('editor');
              }}
              onOpenGuide={() => setShowGuide(true)}
              notify={notify}
            />
          )
        ) : (
          <AssetLibrary
            project={studio.activeProject}
            tickets={studio.projectTickets}
            groupFilter={groupFilter}
            settings={studio.settings}
            onOpenTicket={(id) => {
              studio.selectTicket(id);
              setViewMode('editor');
            }}
            onExportTicket={handleExportTicket}
            notify={notify}
          />
        )}
      </main>

      {showNewTicket && studio.activeProject ? (
        <NewTicketDialog
          defaultDimensions={studio.activeProject.defaultDimensions}
          onClose={() => setShowNewTicket(false)}
          onSubmit={handleCreateTicket}
        />
      ) : null}

      {showNewProject ? (
        <NewProjectDialog onClose={() => setShowNewProject(false)} onSubmit={handleCreateProject} />
      ) : null}

      {settingsTicket ? (
        <TicketSettingsDialog
          ticket={settingsTicket}
          onClose={() => setSettingsTicketId(null)}
          onSave={handleSaveTicketSettings}
          onArchive={() => handleArchiveTicket(settingsTicket)}
          onDelete={() => requestDeleteTicket(settingsTicket)}
        />
      ) : null}

      {showProjectSettings && studio.activeProject ? (
        <ProjectSettingsDialog
          project={studio.activeProject}
          onClose={() => setShowProjectSettings(false)}
          onSave={async (patch) => {
            await studio.updateProject(studio.activeProject!.id, patch);
            setShowProjectSettings(false);
            notify(t('toast.projectUpdated'), 'success');
          }}
          onDelete={() => {
            setShowProjectSettings(false);
            handleDeleteProject();
          }}
        />
      ) : null}

      {showGuide ? <AiGuideDialog onClose={() => setShowGuide(false)} /> : null}
      {showImport ? (
        <BlueprintImportDialog onClose={() => setShowImport(false)} onImport={handleImportBlueprint} />
      ) : null}

      {confirmState ? (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          danger={confirmState.danger}
          onCancel={() => setConfirmState(null)}
          onConfirm={confirmState.onConfirm}
        />
      ) : null}

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </div>
  );
}

export default App;
