import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStudio, type NewProjectInput, type NewTicketInput } from './state/useStudio';
import type { SceneBlueprint, Ticket } from './types';
import { Editor, type EditorHandle } from './components/Editor';
import { TicketQueue } from './components/TicketQueue';
import { AssetLibrary } from './components/AssetLibrary';
import { SceneView } from './components/SceneView';
import { NewTicketDialog } from './components/NewTicketDialog';
import { NewProjectDialog } from './components/NewProjectDialog';
import { TicketSettingsDialog } from './components/TicketSettingsDialog';
import { ProjectSettingsDialog } from './components/ProjectSettingsDialog';
import { AiGuideDialog } from './components/AiGuideDialog';
import { ConfirmDialog } from './components/Modal';
import { ToastStack, type ToastItem } from './components/Toast';
import { Icon } from './components/Icon';
import { DUNGEON_ENTRANCE_BLUEPRINT } from './data/dungeonScene';
import { composeTicketBlob } from './drawing/compose';
import { buildAssetFilename } from './utils/naming';
import { downloadBlob } from './utils/download';
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

  const activeSceneName = studio.activeTicket?.sceneId
    ? studio.scenes.find((scene) => scene.id === studio.activeTicket?.sceneId)?.name ?? null
    : null;

  const handleLoadDemoScene = () => {
    if (studio.projectScenes.some((scene) => scene.name === DUNGEON_ENTRANCE_BLUEPRINT.name)) {
      notify(t('toast.demoSceneExists'), 'info');
      return;
    }
    void studio.importBlueprint(DUNGEON_ENTRANCE_BLUEPRINT).then((scene) => {
      if (scene) notify(t('toast.sceneLoaded', { count: scene.items.length }), 'success');
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
    void studio.importBlueprint(blueprint);
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
          <button className="icon-button" title={t('app.newProjectTitle')} onClick={() => setShowNewProject(true)}>
            <Icon name="plus" size={16} />
          </button>
          <button
            className="icon-button"
            title={t('app.projectSettingsTitle')}
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
          <button className="icon-button" title={t('app.aiGuide')} aria-label={t('app.aiGuide')} onClick={() => setShowGuide(true)}>
            <Icon name="bot" size={16} />
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
        <TicketQueue
          tickets={studio.projectTickets}
          scenes={studio.projectScenes}
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
              <Icon name="brush" size={40} />
              <h2>{t('app.empty.title')}</h2>
              <p>{t('app.empty.body')}</p>
              <button className="primary-button" onClick={() => setShowNewTicket(true)}>
                <Icon name="plus" size={15} /> {t('app.empty.newTicket')}
              </button>
            </section>
          )
        ) : viewMode === 'scene' ? (
          <SceneView
            project={studio.activeProject}
            scenes={studio.projectScenes}
            activeScene={studio.activeScene}
            tickets={studio.projectTickets}
            settings={studio.settings}
            onSelectScene={studio.selectScene}
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
        ) : (
          <AssetLibrary
            project={studio.activeProject}
            tickets={studio.projectTickets}
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
