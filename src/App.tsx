import { useCallback, useEffect, useRef, useState } from 'react';
import { useStudio, type NewProjectInput, type NewTicketInput } from './state/useStudio';
import type { Ticket } from './types';
import { Editor, type EditorHandle } from './components/Editor';
import { TicketQueue } from './components/TicketQueue';
import { AssetLibrary } from './components/AssetLibrary';
import { NewTicketDialog } from './components/NewTicketDialog';
import { NewProjectDialog } from './components/NewProjectDialog';
import { TicketSettingsDialog } from './components/TicketSettingsDialog';
import { ProjectSettingsDialog } from './components/ProjectSettingsDialog';
import { ConfirmDialog } from './components/Modal';
import { ToastStack, type ToastItem } from './components/Toast';
import { Icon } from './components/Icon';
import { composeTicketBlob } from './drawing/compose';
import { buildAssetFilename } from './utils/naming';
import { downloadBlob } from './utils/download';
import { createId } from './utils/id';

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

type ViewMode = 'editor' | 'library';

function App() {
  const studio = useStudio();
  const [viewMode, setViewMode] = useState<ViewMode>('editor');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [settingsTicketId, setSettingsTicketId] = useState<string | null>(null);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
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

  const settingsTicket =
    settingsTicketId !== null ? studio.tickets.find((ticket) => ticket.id === settingsTicketId) ?? null : null;

  const handleCreateTicket = async (input: NewTicketInput) => {
    if (!studio.activeProject) return;
    await studio.createTicket(input, studio.activeProject.id);
    setShowNewTicket(false);
    setViewMode('editor');
    notify('Ticket created', 'success');
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
    notify('Ticket updated', 'success');
  };

  const handleArchiveTicket = async (ticket: Ticket) => {
    await studio.updateTicket(ticket.id, { ...editorRef.current?.flush?.(), status: 'archived', archivedAt: Date.now() });
    setSettingsTicketId(null);
    notify('Ticket archived', 'success');
  };

  const requestDeleteTicket = (ticket: Ticket) => {
    setSettingsTicketId(null);
    setConfirmState({
      title: 'Delete ticket?',
      message: `“${ticket.title}” and its artwork will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete ticket',
      danger: true,
      onConfirm: async () => {
        await studio.deleteTicket(ticket.id);
        setConfirmState(null);
        notify('Ticket deleted', 'success');
      },
    });
  };

  const handleExportTicket = async (ticket: Ticket) => {
    try {
      const blob = await composeTicketBlob(ticket);
      if (!blob) {
        notify('Export failed', 'error');
        return;
      }
      downloadBlob(blob, buildAssetFilename(ticket, studio.activeProject, studio.settings));
      await studio.updateTicket(ticket.id, { version: ticket.version + 1 });
      notify('Exported PNG asset', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Export failed', 'error');
    }
  };

  const handleCreateProject = async (input: NewProjectInput) => {
    await studio.createProject(input);
    setShowNewProject(false);
    setViewMode('editor');
    notify('Project created', 'success');
  };

  const handleDeleteProject = () => {
    if (!studio.activeProject) return;
    const project = studio.activeProject;
    setConfirmState({
      title: 'Delete project?',
      message: `“${project.name}” and all of its tickets and artwork will be permanently removed.`,
      confirmLabel: 'Delete project',
      danger: true,
      onConfirm: async () => {
        await studio.deleteProject(project.id);
        setConfirmState(null);
        notify('Project deleted', 'success');
      },
    });
  };

  if (studio.loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Loading Creative Collab Studio…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">CC</div>
          <div>
            <p className="eyebrow">Creative Workspace</p>
            <h1>Creative Collab Studio</h1>
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
          <button className="icon-button" title="New project" onClick={() => setShowNewProject(true)}>
            <Icon name="plus" size={16} />
          </button>
          <button className="icon-button" title="Project settings" onClick={() => setShowProjectSettings(true)}>
            <Icon name="settings" size={16} />
          </button>
        </div>

        <div className="topbar-right">
          <div className="segmented">
            <button className={viewMode === 'editor' ? 'active' : ''} onClick={() => setViewMode('editor')}>
              <Icon name="brush" size={15} /> Workspace
            </button>
            <button className={viewMode === 'library' ? 'active' : ''} onClick={() => setViewMode('library')}>
              <Icon name="layers" size={15} /> Assets
            </button>
          </div>
          <button
            className="icon-button"
            title="Toggle theme"
            onClick={() =>
              studio.updateSettings({ theme: studio.settings.theme === 'dark' ? 'light' : 'dark' })
            }
          >
            <Icon name="settings" size={16} />
          </button>
        </div>
      </header>

      <main className="app-main">
        <TicketQueue
          tickets={studio.projectTickets}
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
              settings={studio.settings}
              onUpdateTicket={studio.updateTicket}
              onAddNote={studio.addNote}
              onAddRecentColor={studio.addRecentColor}
              onOpenSettings={() => openTicketSettings(studio.activeTicket!)}
              notify={notify}
            />
          ) : (
            <section className="editor-panel empty">
              <Icon name="brush" size={40} />
              <h2>No ticket selected</h2>
              <p>Create a ticket to start painting game art.</p>
              <button className="primary-button" onClick={() => setShowNewTicket(true)}>
                <Icon name="plus" size={15} /> New ticket
              </button>
            </section>
          )
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
            notify('Project updated', 'success');
          }}
          onDelete={() => {
            setShowProjectSettings(false);
            handleDeleteProject();
          }}
        />
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
