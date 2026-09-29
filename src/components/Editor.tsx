import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { BackgroundKind, BrushSettings, LayerState, Project, StudioSettings, Ticket, TicketStatus, ViewState } from '../types';
import { STATUS_LABEL } from '../types';
import { DrawingEngine } from '../drawing/DrawingEngine';
import { buildAssetFilename } from '../utils/naming';
import { downloadBlob } from '../utils/download';
import { CanvasStage } from './CanvasStage';
import { Toolbar } from './Toolbar';
import { LayersPanel } from './LayersPanel';
import { NotesPanel } from './NotesPanel';
import { ConfirmDialog } from './Modal';
import { Icon } from './Icon';

export interface EditorHandle {
  flush: () => { layers: LayerState[]; background: BackgroundKind } | null;
}

interface EditorProps {
  ticket: Ticket;
  project: Project | null;
  settings: StudioSettings;
  onUpdateTicket: (id: string, patch: Partial<Ticket>, options?: { touch?: boolean }) => Promise<void> | void;
  onAddNote: (ticketId: string, body: string) => void;
  onAddRecentColor: (color: string) => void;
  onOpenSettings: () => void;
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  {
    ticket,
    project,
    settings,
    onUpdateTicket,
    onAddNote,
    onAddRecentColor,
    onOpenSettings,
    notify,
  },
  ref,
) {
  const engineHolder = useRef<{ id: string; engine: DrawingEngine } | null>(null);
  if (!engineHolder.current || engineHolder.current.id !== ticket.id) {
    engineHolder.current = {
      id: ticket.id,
      engine: new DrawingEngine(
        ticket.dimensions.width,
        ticket.dimensions.height,
        ticket.background,
      ),
    };
  }
  const engine = engineHolder.current.engine;

  useSyncExternalStore(engine.subscribe, engine.getVersion);

  const [brush, setBrush] = useState<BrushSettings>({
    tool: 'brush',
    preset: 'hard',
    color: settings.recentColors[0] ?? '#111827',
    size: 8,
    opacity: 1,
    hardness: 0.6,
  });
  const [view, setView] = useState<ViewState>({
    zoom: 1,
    panX: 0,
    panY: 0,
    showGrid: false,
    gridSize: 16,
    showReferences: true,
  });
  const [ready, setReady] = useState(false);
  const [fitNonce, setFitNonce] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const baselineRef = useRef<LayerState[] | null>(null);

  const viewChange = useCallback((patch: Partial<ViewState>) => {
    setView((current) => ({ ...current, ...patch }));
  }, []);

  const snapshotLayers = useCallback(
    () => ({ layers: engine.serializeLayers(), background: engine.getBackground() }),
    [engine],
  );

  // Keep latest callbacks available to stable effects.
  const persistRef = useRef<() => void>(() => {});
  const ticketIdRef = useRef(ticket.id);
  ticketIdRef.current = ticket.id;
  const readyRef = useRef(false);
  readyRef.current = ready;

  useEffect(() => {
    if (!engineHolder.current || engineHolder.current.engine !== engine) return;
    persistRef.current = () => {
      if (!readyRef.current) return;
      void onUpdateTicket(ticketIdRef.current, snapshotLayers(), { touch: false });
    };
  }, [engine, onUpdateTicket, snapshotLayers]);

  const saveTimer = useRef<number | null>(null);
  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      persistRef.current();
      saveTimer.current = null;
    }, 700);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    engine.loadFromLayers(ticket.layers, ticket.background).then(() => {
      if (cancelled) return;
      baselineRef.current = ticket.layers.map((layer) => ({ ...layer }));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      persistRef.current();
    };
  }, [engine]);

  useEffect(() => {
    const handleBeforeUnload = () => persistRef.current();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (engine.getBackground() !== ticket.background) {
      engine.setBackground(ticket.background);
    }
  }, [engine, ticket.background]);

  useEffect(() => {
    const { width, height } = engine.getSize();
    if (width !== ticket.dimensions.width || height !== ticket.dimensions.height) {
      engine.resize(ticket.dimensions.width, ticket.dimensions.height);
      scheduleSave();
      setFitNonce((value) => value + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, ticket.dimensions.width, ticket.dimensions.height]);

  useImperativeHandle(ref, () => ({ flush: () => (readyRef.current ? snapshotLayers() : null) }), [snapshotLayers]);

  const changeStatus = useCallback(
    (status: TicketStatus) => {
      void onUpdateTicket(ticket.id, {
        ...snapshotLayers(),
        status,
        completedAt: status === 'complete' ? ticket.completedAt ?? Date.now() : ticket.completedAt,
        archivedAt: status === 'archived' ? Date.now() : ticket.archivedAt,
      });
    },
    [onUpdateTicket, ticket.id, ticket.completedAt, ticket.archivedAt, snapshotLayers],
  );

  const handleExport = useCallback(async () => {
    const blob = await engine.exportBlob();
    if (!blob) {
      notify('Export failed. The canvas could not be rendered.', 'error');
      return;
    }
    downloadBlob(blob, buildAssetFilename(ticket, project, settings));
    await onUpdateTicket(ticket.id, { ...snapshotLayers(), version: ticket.version + 1 });
    notify('Exported PNG asset', 'success');
  }, [engine, ticket, project, settings, onUpdateTicket, notify, snapshotLayers]);

  const handleRevert = useCallback(async () => {
    if (!baselineRef.current) return;
    await engine.loadFromLayers(baselineRef.current, engine.getBackground());
    setConfirmRevert(false);
    setFitNonce((value) => value + 1);
    scheduleSave();
    notify('Reverted to last saved state', 'success');
  }, [engine, scheduleSave, notify]);

  const handlePickColor = useCallback(
    (color: string) => {
      setBrush((current) => ({ ...current, color }));
      onAddRecentColor(color);
    },
    [onAddRecentColor],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod && key === 'z') {
        event.preventDefault();
        (event.shiftKey ? engine.redo() : engine.undo()).then(() => scheduleSave());
        return;
      }
      if (mod && key === 'y') {
        event.preventDefault();
        engine.redo().then(() => scheduleSave());
        return;
      }
      if (mod && key === 's') {
        event.preventDefault();
        persistRef.current();
        notify('Progress saved', 'success');
        return;
      }
      if (mod) return;

      if (key === 'b') setBrush((current) => ({ ...current, tool: 'brush' }));
      else if (key === 'e') setBrush((current) => ({ ...current, tool: 'eraser' }));
      else if (key === 'g') setBrush((current) => ({ ...current, tool: 'fill' }));
      else if (key === 'i') setBrush((current) => ({ ...current, tool: 'eyedropper' }));
      else if (key === 'h') setBrush((current) => ({ ...current, tool: 'pan' }));
      else if (event.key === '[') setBrush((current) => ({ ...current, size: Math.max(1, current.size - 2) }));
      else if (event.key === ']') setBrush((current) => ({ ...current, size: Math.min(128, current.size + 2) }));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [engine, scheduleSave, notify]);

  useEffect(() => {
    const handler = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      event.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        let layer =
          engine.getLayers().find((item) => item.id === engine.getActiveLayerId() && item.kind === 'reference') ??
          engine.getLayers().find((item) => item.kind === 'reference');
        if (!layer) {
          const id = engine.addLayer('reference');
          layer = engine.getLayers().find((item) => item.id === id);
        }
        if (!layer) return;
        void engine.setReferenceImage(layer.id, reader.result).then(() => scheduleSave());
        notify('Reference image loaded', 'success');
      };
      reader.readAsDataURL(file);
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [engine, scheduleSave, notify]);

  const dimensions = engine.getSize();
  const canUndo = engine.canUndo();
  const canRedo = engine.canRedo();

  return (
    <section className="editor-panel">
      <Toolbar
        brush={brush}
        onBrushChange={(patch) => setBrush((current) => ({ ...current, ...patch }))}
        onCommitColor={onAddRecentColor}
        recentColors={settings.recentColors}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => engine.undo().then(() => scheduleSave())}
        onRedo={() => engine.redo().then(() => scheduleSave())}
        onClear={() => setConfirmClear(true)}
        onExport={handleExport}
        view={view}
        onViewChange={viewChange}
        onFit={() => setFitNonce((value) => value + 1)}
        status={ticket.status}
        onStatusChange={changeStatus}
      />

      <div className="editor-body">
        <div className="stage-wrap">
          {ready ? (
            <CanvasStage
              engine={engine}
              view={view}
              onViewChange={viewChange}
              brush={brush}
              onPickColor={handlePickColor}
              onCommit={scheduleSave}
              fitNonce={fitNonce}
            />
          ) : (
            <div className="canvas-loading">Loading canvas…</div>
          )}
          <div className="stage-hud">
            <span>{dimensions.width} × {dimensions.height}</span>
            <span>·</span>
            <span>{Math.round(view.zoom * 100)}%</span>
          </div>
        </div>

        <aside className="editor-inspector">
          <div className="ticket-header">
            <div className="ticket-header-top">
              <span className="label">{ticket.type}</span>
              <span className={`status ${ticket.status}`}>{STATUS_LABEL[ticket.status]}</span>
            </div>
            <h2>{ticket.title}</h2>
            <p className="ticket-brief">{ticket.description || 'No brief provided.'}</p>
            <div className="ticket-header-actions">
              <button className="ghost-button small" onClick={onOpenSettings}>
                <Icon name="edit" size={14} /> Edit details
              </button>
              {ticket.status !== 'complete' ? (
                <button className="primary-button small" onClick={() => changeStatus('complete')}>
                  <Icon name="check" size={14} /> Mark complete
                </button>
              ) : (
                <button className="ghost-button small" onClick={() => changeStatus('in-progress')}>
                  <Icon name="undo" size={14} /> Reopen
                </button>
              )}
              <button className="ghost-button small" onClick={() => setConfirmRevert(true)}>
                <Icon name="reset" size={14} /> Revert
              </button>
            </div>
          </div>

          <LayersPanel engine={engine} onChanged={scheduleSave} />
          <NotesPanel ticket={ticket} onAddNote={(body) => onAddNote(ticket.id, body)} />
        </aside>
      </div>

      {confirmClear ? (
        <ConfirmDialog
          title="Clear active layer?"
          message="This removes everything on the active layer. You can undo this action."
          confirmLabel="Clear layer"
          danger
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            engine.clearActiveLayer();
            scheduleSave();
            setConfirmClear(false);
          }}
        />
      ) : null}

      {confirmRevert ? (
        <ConfirmDialog
          title="Revert to last saved state?"
          message="All changes made since this ticket was opened will be discarded."
          confirmLabel="Revert"
          danger
          onCancel={() => setConfirmRevert(false)}
          onConfirm={handleRevert}
        />
      ) : null}
    </section>
  );
});
