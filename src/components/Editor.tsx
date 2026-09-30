import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type {
  BackgroundKind,
  GuideShape,
  LayerState,
  Project,
  StudioSettings,
  Ticket,
  TicketStatus,
  ToolSettings,
  ViewState,
} from '../types';
import { DrawingEngine } from '../drawing/DrawingEngine';
import { t } from '../i18n';
import { buildAssetFilename } from '../utils/naming';
import { downloadBlob } from '../utils/download';
import { CanvasStage } from './CanvasStage';
import { PaintRibbon } from './PaintRibbon';
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
  sceneName?: string | null;
  settings: StudioSettings;
  onUpdateTicket: (id: string, patch: Partial<Ticket>, options?: { touch?: boolean }) => Promise<void> | void;
  onAddNote: (ticketId: string, body: string) => void;
  onAddRecentColor: (color: string) => void;
  onOpenSettings: () => void;
  onToggleTrim: () => void;
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  {
    ticket,
    project,
    sceneName,
    settings: studioSettings,
    onUpdateTicket,
    onAddNote,
    onAddRecentColor,
    onOpenSettings,
    onToggleTrim,
    notify,
  },
  ref,
) {
  const engineHolder = useRef<{ id: string; engine: DrawingEngine } | null>(null);
  if (!engineHolder.current || engineHolder.current.id !== ticket.id) {
    engineHolder.current = {
      id: ticket.id,
      engine: new DrawingEngine(ticket.dimensions.width, ticket.dimensions.height, ticket.background),
    };
  }
  const engine = engineHolder.current.engine;

  useSyncExternalStore(engine.subscribe, engine.getVersion);

  const [tool, setTool] = useState<ToolSettings>({
    tool: 'brush',
    preset: 'hard',
    color: studioSettings.recentColors[0] ?? '#111827',
    color2: '#ffffff',
    size: 6,
    opacity: 1,
    hardness: 0.6,
    shapeOutline: 'color1',
    shapeFill: 'none',
    fontFamily: 'Arial',
    fontSize: 24,
  });
  const [view, setView] = useState<ViewState>({
    zoom: 1,
    panX: 0,
    panY: 0,
    showGrid: false,
    gridSize: 16,
    showReferences: true,
    guide: 'none',
  });
  const [ready, setReady] = useState(false);
  const [fitNonce, setFitNonce] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const baselineRef = useRef<LayerState[] | null>(null);

  const updateTool = useCallback((patch: Partial<ToolSettings>) => {
    setTool((current) => ({ ...current, ...patch }));
  }, []);

  const viewChange = useCallback((patch: Partial<ViewState>) => {
    setView((current) => ({ ...current, ...patch }));
  }, []);

  const snapshotLayers = useCallback(
    () => ({ layers: engine.serializeLayers(), background: engine.getBackground() }),
    [engine],
  );

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
    }, 400);
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
    const flush = () => persistRef.current();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
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
      notify(t('editor.toast.historyCleared'), 'info');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, ticket.dimensions.width, ticket.dimensions.height]);

  // Abandon any in-progress shape when switching tools.
  useEffect(() => {
    engine.cancelShape();
  }, [engine, tool.tool]);

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
    const blob = await engine.exportBlob({ trim: studioSettings.trimOnExport });
    if (!blob) {
      notify(t('editor.toast.exportFailed'), 'error');
      return;
    }
    downloadBlob(blob, buildAssetFilename(ticket, project, studioSettings));
    await onUpdateTicket(ticket.id, { ...snapshotLayers(), version: ticket.version + 1 });
    notify(t('toast.exported'), 'success');
  }, [engine, ticket, project, studioSettings, onUpdateTicket, notify, snapshotLayers]);

  const handleRevert = useCallback(async () => {
    if (!baselineRef.current) return;
    await engine.loadFromLayers(baselineRef.current, engine.getBackground());
    setConfirmRevert(false);
    setFitNonce((value) => value + 1);
    scheduleSave();
    notify(t('editor.toast.reverted'), 'success');
  }, [engine, scheduleSave, notify]);

  const handlePickColor = useCallback(
    (color: string, secondary: boolean) => {
      if (secondary) {
        setTool((current) => ({ ...current, color2: color }));
      } else {
        setTool((current) => ({ ...current, color }));
        onAddRecentColor(color);
      }
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
        notify(t('editor.toast.saved'), 'success');
        return;
      }
      if (mod) return;

      if (event.key === 'Enter' && engine.isPolygonShaping()) {
        engine.finishPolygon();
        scheduleSave();
        return;
      }
      if (event.key === 'Escape') {
        engine.cancelShape();
        return;
      }
      if (event.key === '[') setTool((current) => ({ ...current, size: Math.max(1, current.size - 1) }));
      else if (event.key === ']') setTool((current) => ({ ...current, size: Math.min(64, current.size + 1) }));
      else if (key === 'b') updateTool({ tool: 'brush' });
      else if (key === 'p') updateTool({ tool: 'pencil' });
      else if (key === 'e') updateTool({ tool: 'eraser' });
      else if (key === 'f') updateTool({ tool: 'fill' });
      else if (key === 't') updateTool({ tool: 'text' });
      else if (key === 'i') updateTool({ tool: 'eyedropper' });
      else if (key === 'h') updateTool({ tool: 'pan' });
      else if (key === 'l') updateTool({ tool: 'line' });
      else if (key === 'r') updateTool({ tool: 'rect' });
      else if (key === 'o') updateTool({ tool: 'ellipse' });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [engine, scheduleSave, notify, updateTool]);

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
        notify(t('editor.toast.referenceLoaded'), 'success');
      };
      reader.readAsDataURL(file);
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [engine, scheduleSave, notify]);

  const dimensions = engine.getSize();
  const canUndo = engine.canUndo();
  const canRedo = engine.canRedo();
  const zoomPercent = Math.round(view.zoom * 100);
  const modeHint = engine.isPolygonShaping()
    ? t('tool.hint.polygon')
    : engine.isCurveBending()
      ? t('tool.hint.curve')
      : null;

  return (
    <section className="editor-panel">
      <PaintRibbon
        settings={tool}
        onSettingsChange={updateTool}
        recentColors={studioSettings.recentColors}
        onCommitColor={onAddRecentColor}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => engine.undo().then(() => scheduleSave())}
        onRedo={() => engine.redo().then(() => scheduleSave())}
        onClear={() => setConfirmClear(true)}
        onExport={handleExport}
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
              settings={tool}
              onPickColor={handlePickColor}
              onCommit={scheduleSave}
              onCursorMove={setCursor}
              fitNonce={fitNonce}
            />
          ) : (
            <div className="canvas-loading">{t('editor.loading')}</div>
          )}

          <div className="paint-vsliders">
            <div className="vslider" title={t('ribbon.lineWidth')}>
              <input
                type="range"
                min={1}
                max={64}
                value={tool.size}
                onChange={(event) => updateTool({ size: Number(event.target.value) })}
              />
              <span className="vslider-value">{tool.size}</span>
            </div>
            <div className="vslider" title={t('tool.opacity')}>
              <input
                type="range"
                min={5}
                max={100}
                value={Math.round(tool.opacity * 100)}
                onChange={(event) => updateTool({ opacity: Number(event.target.value) / 100 })}
              />
              <span className="vslider-value">{Math.round(tool.opacity * 100)}</span>
            </div>
          </div>
        </div>
      </div>

      <aside className="editor-inspector">
          <div className="ticket-header">
            <div className="ticket-header-top">
              <span className="label">{t(`type.${ticket.type}` as const)}</span>
              <span className={`status ${ticket.status}`}>{t(`status.${ticket.status}` as const)}</span>
            </div>
            <h2>{ticket.title}</h2>
            {sceneName ? (
              <span className="scene-tag">
                <Icon name="layers" size={11} /> {sceneName}
              </span>
            ) : null}
            <p className="ticket-brief">{ticket.description || t('editor.noBrief')}</p>
            <div className="ticket-header-actions">
              <button className="ghost-button small" onClick={onOpenSettings}>
                <Icon name="edit" size={14} /> {t('editor.editDetails')}
              </button>
              {ticket.status !== 'complete' ? (
                <button className="primary-button small" onClick={() => changeStatus('complete')}>
                  <Icon name="check" size={14} /> {t('editor.markComplete')}
                </button>
              ) : (
                <button className="ghost-button small" onClick={() => changeStatus('in-progress')}>
                  <Icon name="undo" size={14} /> {t('editor.reopen')}
                </button>
              )}
              <button className="ghost-button small" onClick={() => setConfirmRevert(true)}>
                <Icon name="reset" size={14} /> {t('editor.revert')}
              </button>
            </div>
          </div>

          <LayersPanel engine={engine} onChanged={scheduleSave} />
          <NotesPanel ticket={ticket} onAddNote={(body) => onAddNote(ticket.id, body)} />
      </aside>

      <div className="editor-statusbar">
        <span className="statusbar-cell">
          {cursor
            ? t('status.position', { x: Math.round(cursor.x), y: Math.round(cursor.y) })
            : '–'}
        </span>
        <span className="statusbar-cell">{t('status.canvas', { w: dimensions.width, h: dimensions.height })}</span>
        {modeHint ? <span className="statusbar-hint">{modeHint}</span> : null}
        <span className="statusbar-spacer" />
        <button
          className={`statusbar-button ${view.showGrid ? 'active' : ''}`}
          onClick={() => viewChange({ showGrid: !view.showGrid })}
          title={t('ribbon.grid')}
          aria-label={t('ribbon.grid')}
          aria-pressed={view.showGrid}
        >
          <Icon name="grid" size={14} />
        </button>
        <select
          className="statusbar-select"
          value={view.gridSize}
          title={t('tool.gridSize')}
          onChange={(event) => viewChange({ gridSize: Number(event.target.value), showGrid: true })}
        >
          {[4, 8, 16, 32, 64].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <button
          className={`statusbar-button ${view.showReferences ? 'active' : ''}`}
          onClick={() => viewChange({ showReferences: !view.showReferences })}
          title={t('ribbon.references')}
          aria-label={t('ribbon.references')}
          aria-pressed={view.showReferences}
        >
          <Icon name="image" size={14} />
        </button>
        <select
          className="statusbar-select"
          value={view.guide}
          title={t('ribbon.guide')}
          aria-label={t('ribbon.guide')}
          onChange={(event) => viewChange({ guide: event.target.value as GuideShape })}
        >
          {(['none', 'circle', 'hexagon', 'diamond'] as GuideShape[]).map((guide) => (
            <option key={guide} value={guide}>
              {t(`guide.${guide}` as const)}
            </option>
          ))}
        </select>
        <button
          className={`statusbar-button ${studioSettings.trimOnExport ? 'active' : ''}`}
          onClick={onToggleTrim}
          title={t('status.trim')}
          aria-label={t('status.trim')}
          aria-pressed={studioSettings.trimOnExport}
        >
          <Icon name="crop" size={14} />
        </button>
        <span className="statusbar-sep" />
        <button className="statusbar-button" onClick={() => viewChange({ zoom: Math.max(0.05, view.zoom / 1.2) })} title={t('ribbon.zoomOut')} aria-label={t('ribbon.zoomOut')}>
          <Icon name="zoom-out" size={14} />
        </button>
        <input
          className="statusbar-zoom"
          type="range"
          min={5}
          max={1600}
          value={Math.min(1600, Math.max(5, zoomPercent))}
          onChange={(event) => viewChange({ zoom: Number(event.target.value) / 100 })}
          aria-label={t('status.zoom')}
        />
        <button className="statusbar-button" onClick={() => viewChange({ zoom: Math.min(16, view.zoom * 1.2) })} title={t('ribbon.zoomIn')} aria-label={t('ribbon.zoomIn')}>
          <Icon name="zoom-in" size={14} />
        </button>
        <button className="statusbar-button" onClick={() => setFitNonce((value) => value + 1)} title={t('ribbon.fit')} aria-label={t('ribbon.fit')}>
          <Icon name="fit" size={14} />
        </button>
        <span className="statusbar-cell zoom-value">{zoomPercent}%</span>
      </div>

      {confirmClear ? (
        <ConfirmDialog
          title={t('editor.confirm.clear.title')}
          message={t('editor.confirm.clear.body')}
          confirmLabel={t('editor.confirm.clear.confirm')}
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
          title={t('editor.confirm.revert.title')}
          message={t('editor.confirm.revert.body')}
          confirmLabel={t('editor.confirm.revert.confirm')}
          danger
          onCancel={() => setConfirmRevert(false)}
          onConfirm={handleRevert}
        />
      ) : null}
    </section>
  );
});
