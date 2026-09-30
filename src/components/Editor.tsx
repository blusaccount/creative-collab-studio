import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type {
  BackgroundKind,
  GuideShape,
  LayerState,
  MapType,
  Project,
  Scene,
  StudioSettings,
  Ticket,
  TicketStatus,
  ToolSettings,
  ViewState,
} from '../types';
import { DrawingEngine } from '../drawing/DrawingEngine';
import { createDefaultLayerStates } from '../drawing/factory';
import { t } from '../i18n';
import { createPartUvTemplate } from '../scenes/build';
import { mapColorSpace, mapDefaultBackground, mapPurposeKey, packingHintKey } from '../scenes/maps';
import { buildAssetFilename } from '../utils/naming';
import { downloadBlob } from '../utils/download';
import { composeTemplatePng, composeTemplatePsd, isPsdFile, readImageToCanvas, readPsdToCanvas } from '../utils/psd';
import { CanvasStage } from './CanvasStage';
import { PaintRibbon } from './PaintRibbon';
import { ModelPreview } from './ModelPreview';
import { LayersPanel } from './LayersPanel';
import { NotesPanel } from './NotesPanel';
import { ConfirmDialog } from './Modal';
import { Icon } from './Icon';

export interface EditorHandle {
  flush: () =>
    | ({ layers: LayerState[]; background: BackgroundKind } & Partial<Pick<Ticket, 'materialMapLayers'>>)
    | null;
}

function materialBrushColor(map: MapType, value: number, color: string): string {
  if (map === 'basecolor' || map === 'normal' || map === 'emissive' || map === 'other' || map === 'packed') {
    return color;
  }
  const amount = map === 'ao' ? 100 - value : value;
  const channel = Math.round((amount / 100) * 255).toString(16).padStart(2, '0');
  return `#${channel}${channel}${channel}`;
}

function createMaterialMapLayers(map: MapType, uvTemplate?: string, partName?: string): LayerState[] {
  const layers = createDefaultLayerStates({ paintName: `Paint – ${map}`, referenceName: 'UV – Reference' });
  const reference = layers.find((layer) => layer.kind === 'reference');
  if (reference) {
    if (partName) reference.dataUrl = createPartUvTemplate(partName);
    else if (uvTemplate) reference.dataUrl = uvTemplate;
  }
  return layers;
}

function nameMaterialMapLayers(layers: LayerState[], map: MapType): LayerState[] {
  if (map === 'basecolor') return layers;
  return layers.map((layer) =>
    layer.kind === 'draw' && layer.name === 'Paint – BaseColor'
      ? { ...layer, name: `Paint – ${map}` }
      : layer,
  );
}

interface EditorProps {
  ticket: Ticket;
  project: Project | null;
  sceneName?: string | null;
  uvTemplate?: string;
  modelGroup?: Scene | null;
  groupTickets?: Ticket[];
  onAttachModel?: (file: File) => void;
  onOpenTicket?: (id: string) => void;
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
    uvTemplate,
    modelGroup,
    groupTickets,
    onAttachModel,
    onOpenTicket,
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
  const materialChannels = modelGroup?.kind === 'model' ? ticket.materialChannels ?? [] : [];
  const [activeMaterialChannel, setActiveMaterialChannel] = useState<MapType>(
    materialChannels.find((channel) => channel.map === 'basecolor')?.map ?? materialChannels[0]?.map ?? 'basecolor',
  );
  const activeMaterialChannelRef = useRef(activeMaterialChannel);
  activeMaterialChannelRef.current = activeMaterialChannel;
  const materialMapLayersRef = useRef(ticket.materialMapLayers ?? {});
  const baseColorLayersRef = useRef(ticket.layers);
  const [materialValue, setMaterialValue] = useState<Record<string, number>>({
    metallic: 0,
    roughness: 35,
    ao: 0,
    opacity: 100,
    height: 50,
  });
  const [paintSurface, setPaintSurface] = useState<'uv' | 'model'>('uv');
  const [liveMaterialVersion, setLiveMaterialVersion] = useState(0);
  const liveMaterialCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [view, setView] = useState<ViewState>({
    zoom: 1,
    panX: 0,
    panY: 0,
    showGrid: false,
    gridSize: 16,
    showReferences: true,
    guide: 'none',
    showUvOverlay: true,
  });
  const [ready, setReady] = useState(false);
  const [fitNonce, setFitNonce] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [previewWidth, setPreviewWidth] = useState(380);
  const previewResizeRef = useRef<number | null>(null);
  const savedTimer = useRef<number | null>(null);
  const baselineRef = useRef<LayerState[] | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const appliedUvRef = useRef(false);

  const updateTool = useCallback((patch: Partial<ToolSettings>) => {
    setTool((current) => ({ ...current, ...patch }));
  }, []);

  const viewChange = useCallback((patch: Partial<ViewState>) => {
    setView((current) => ({ ...current, ...patch }));
  }, []);

  const updateLiveMaterial = useCallback(() => {
    const canvas = liveMaterialCanvasRef.current;
    if (canvas) engine.renderFull(canvas, { includeBackground: false, includeReferences: false });
    setLiveMaterialVersion((version) => version + 1);
  }, [engine]);

  const snapshotLayers = useCallback(() => {
    const layers = engine.serializeLayers();
    const map = activeMaterialChannelRef.current;
    if (materialChannels.length === 0 || map === 'basecolor') {
      baseColorLayersRef.current = layers;
      return {
        layers,
        background: engine.getBackground(),
        materialMapLayers: materialMapLayersRef.current,
      };
    }
    const materialMapLayers = { ...materialMapLayersRef.current, [map]: layers };
    materialMapLayersRef.current = materialMapLayers;
    return { layers: baseColorLayersRef.current, background: ticket.background, materialMapLayers };
  }, [engine, materialChannels.length, ticket.background, ticket.layers]);

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
    setSaveState('saving');
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      persistRef.current();
      saveTimer.current = null;
      setSaveState('saved');
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaveState('idle'), 2000);
    }, 400);
  }, []);

  const selectMaterialChannel = useCallback(
    async (map: MapType) => {
      const previous = activeMaterialChannelRef.current;
      if (map === previous) return;
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const saved = snapshotLayers();
      void onUpdateTicket(ticket.id, saved, { touch: false });
      const materialMapLayers = saved.materialMapLayers ?? materialMapLayersRef.current;
      materialMapLayersRef.current = materialMapLayers;
      activeMaterialChannelRef.current = map;
      setActiveMaterialChannel(map);
      setReady(false);
      const layers =
        map === 'basecolor'
          ? baseColorLayersRef.current
          : nameMaterialMapLayers(
              materialMapLayers[map] ?? createMaterialMapLayers(map, uvTemplate, ticket.modelPart?.name),
              map,
            );
      if (map !== 'basecolor') {
        materialMapLayersRef.current = { ...materialMapLayers, [map]: layers };
      }
      await engine.loadFromLayers(layers, map === 'basecolor' ? ticket.background : mapDefaultBackground(map));
      baselineRef.current = layers.map((layer) => ({ ...layer }));
      setReady(true);
      setFitNonce((value) => value + 1);
    },
    [engine, onUpdateTicket, snapshotLayers, ticket.background, ticket.id, ticket.layers, ticket.modelPart, uvTemplate],
  );

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const initialMap = activeMaterialChannelRef.current;
    const initialLayers =
      materialChannels.length > 0 && initialMap !== 'basecolor'
        ? nameMaterialMapLayers(
            materialMapLayersRef.current[initialMap] ??
              createMaterialMapLayers(initialMap, uvTemplate, ticket.modelPart?.name),
            initialMap,
          )
        : ticket.layers;
    if (materialChannels.length > 0 && initialMap !== 'basecolor') {
      materialMapLayersRef.current = { ...materialMapLayersRef.current, [initialMap]: initialLayers };
    }
    const initialBackground =
      materialChannels.length > 0 && initialMap !== 'basecolor'
        ? mapDefaultBackground(initialMap)
        : ticket.background;
    engine.loadFromLayers(initialLayers, initialBackground).then(() => {
      if (cancelled) return;
      baselineRef.current = initialLayers.map((layer) => ({ ...layer }));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // Auto-load a model set's shared UV template as the reference layer.
  useEffect(() => {
    if (!ready || appliedUvRef.current || !uvTemplate) return;
    if (ticket.layers.some((layer) => layer.kind === 'reference' && layer.dataUrl)) return;
    appliedUvRef.current = true;
    void engine.applyReferenceTemplate(uvTemplate).then(() => scheduleSave());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, uvTemplate, engine]);

  // Provide the model's UV islands as a non-printing canvas overlay.
  useEffect(() => {
    engine.setUvLayout(
      ticket.modelPart
        ? [{ ...ticket.modelPart, x: 0, y: 0, w: 1, h: 1 }]
        : modelGroup?.uvLayout ?? [],
    );
  }, [engine, modelGroup?.uvLayout, ticket.modelPart]);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    liveMaterialCanvasRef.current = canvas;
    const render = () => {
      engine.renderFull(canvas, { includeBackground: false, includeReferences: false });
    };
    render();
    const unsubscribe = engine.subscribe(render);
    return () => {
      unsubscribe();
      liveMaterialCanvasRef.current = null;
    };
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
      const initialMap = activeMaterialChannelRef.current;
      engine.setBackground(
        materialChannels.length > 0 && initialMap !== 'basecolor'
          ? mapDefaultBackground(initialMap)
          : ticket.background,
      );
    }
  }, [engine, materialChannels.length, ticket.background]);

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
    const exportTicket =
      materialChannels.length > 0
        ? { ...ticket, mapType: activeMaterialChannelRef.current, title: t(`map.${activeMaterialChannelRef.current}` as const) }
        : ticket;
    downloadBlob(blob, buildAssetFilename(exportTicket, project, studioSettings));
    await onUpdateTicket(ticket.id, { ...snapshotLayers(), version: ticket.version + 1 });
    notify(t('toast.exported'), 'success');
  }, [engine, ticket, materialChannels.length, project, studioSettings, onUpdateTicket, notify, snapshotLayers]);

  const handleRevert = useCallback(async () => {
    if (!baselineRef.current) return;
    await engine.loadFromLayers(baselineRef.current, engine.getBackground());
    setConfirmRevert(false);
    setFitNonce((value) => value + 1);
    scheduleSave();
    notify(t('editor.toast.reverted'), 'success');
  }, [engine, scheduleSave, notify]);

  const downloadTemplate = useCallback(
    async (format: 'psd' | 'png') => {
      try {
        const templateTicket =
          materialChannels.length > 0 && activeMaterialChannelRef.current !== 'basecolor'
            ? {
                ...ticket,
                mapType: activeMaterialChannelRef.current,
                title: t(`map.${activeMaterialChannelRef.current}` as const),
                layers: engine.serializeLayers(),
                background: engine.getBackground(),
              }
            : ticket;
        const blob =
          format === 'psd'
            ? await composeTemplatePsd(templateTicket)
            : await composeTemplatePng(templateTicket);
        if (!blob) throw new Error('empty template');
        const base = buildAssetFilename(templateTicket, project, studioSettings).replace(/\.png$/i, '');
        downloadBlob(blob, `${base}-template.${format}`);
        notify(t('editor.toast.templateSaved'), 'success');
      } catch {
        notify(t('editor.toast.templateFailed'), 'error');
      }
    },
    [ticket, materialChannels.length, engine, project, studioSettings, notify],
  );

  const handleUpload = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const canvas = isPsdFile(file) ? await readPsdToCanvas(file) : await readImageToCanvas(file);
        if (!canvas) throw new Error('unreadable');
        if (canvas.width !== ticket.dimensions.width || canvas.height !== ticket.dimensions.height) {
          notify(
            t('editor.uploadMismatch', {
              w: canvas.width,
              h: canvas.height,
              tw: ticket.dimensions.width,
              th: ticket.dimensions.height,
            }),
            'info',
          );
        }
        await engine.setDrawLayerImage(canvas.toDataURL('image/png'));
        scheduleSave();
        changeStatus('complete');
        notify(t('editor.toast.assetImported'), 'success');
      } catch {
        notify(t('editor.toast.importFailed'), 'error');
      }
    },
    [engine, scheduleSave, changeStatus, notify],
  );

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
  const isMaterialTicket = materialChannels.length > 0;
  const selectedMaterialValue = materialValue[activeMaterialChannel] ?? 50;
  const canvasSettings =
    isMaterialTicket && activeMaterialChannel !== 'basecolor'
      ? {
          ...tool,
          tool: 'brush' as const,
          color: materialBrushColor(activeMaterialChannel, selectedMaterialValue, tool.color),
        }
      : tool;
  const modelStrokeSettings =
    canvasSettings.tool === 'pencil' ? { ...canvasSettings, preset: 'hard' as const } : canvasSettings;
  const hasScalarValue =
    activeMaterialChannel === 'metallic' ||
    activeMaterialChannel === 'roughness' ||
    activeMaterialChannel === 'ao' ||
    activeMaterialChannel === 'opacity' ||
    activeMaterialChannel === 'height';
  const guidanceMap = isMaterialTicket ? activeMaterialChannel : ticket.mapType;
  const channelBrief = isMaterialTicket
    ? materialChannels.find((channel) => channel.map === activeMaterialChannel)?.brief
    : undefined;
  const previewStyle = modelGroup
    ? ({ '--editor-preview-width': `${previewWidth}px` } as CSSProperties)
    : undefined;
  const resizePreview = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (previewResizeRef.current !== event.pointerId) return;
    setPreviewWidth(Math.max(220, Math.min(720, window.innerWidth - event.clientX)));
  };
  const paintPoint = (uv: { u: number; v: number }) => {
    const part = ticket.modelPart;
    if (!part) return { x: uv.u * dimensions.width, y: (1 - uv.v) * dimensions.height };
    const u = (uv.u - part.x) / part.w;
    const v = (1 - uv.v - part.y) / part.h;
    const edgeTolerance = 0.0001;
    if (u < -edgeTolerance || u > 1 + edgeTolerance || v < -edgeTolerance || v > 1 + edgeTolerance) return null;
    const localU = Math.max(0, Math.min(1, u));
    const localV = Math.max(0, Math.min(1, v));
    // localV is already top-down (uv.v is bottom-up), so do NOT flip again.
    return { x: localU * dimensions.width, y: localV * dimensions.height };
  };
  const modelPaintMode =
    isMaterialTicket && paintSurface === 'model'
      ? {
          ticketId: ticket.id,
          partName: ticket.modelPart?.name,
          settings: modelStrokeSettings,
          onStart: (uv: { u: number; v: number }) => {
            if (!ready) return;
            const point = paintPoint(uv);
            if (!point) return;
            engine.beginStroke(modelStrokeSettings, point.x, point.y);
            updateLiveMaterial();
          },
          onMove: (uv: { u: number; v: number }) => {
            if (!ready) return;
            const point = paintPoint(uv);
            if (!point) return;
            engine.moveStroke(modelStrokeSettings, point.x, point.y);
            updateLiveMaterial();
          },
          onEnd: () => {
            engine.endStroke();
            scheduleSave();
          },
        }
      : undefined;

  return (
    <section className={`editor-panel ${modelGroup ? 'with-preview' : ''}`} style={previewStyle}>
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
        <div
          className={`stage-wrap ${isMaterialTicket ? 'material-mode' : ''} ${
            isMaterialTicket && paintSurface === 'model' ? 'painting-model' : ''
          }`}
        >
          {isMaterialTicket ? (
            <div className="material-paint-controls">
              <div className="material-channel-buttons" role="group" aria-label={t('material.channel')}>
                {materialChannels.map((channel) => (
                  <button
                    key={channel.map}
                    type="button"
                    className={`chip tiny ${activeMaterialChannel === channel.map ? 'active' : ''}`}
                    onClick={() => void selectMaterialChannel(channel.map)}
                  >
                    {t(`map.${channel.map}` as const)}
                  </button>
                ))}
              </div>
              <div className="material-paint-options">
                {hasScalarValue ? (
                  <label className="material-value">
                    <span>{t(`material.value.${activeMaterialChannel}` as const)}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={selectedMaterialValue}
                      onChange={(event) =>
                        setMaterialValue((current) => ({
                          ...current,
                          [activeMaterialChannel]: Number(event.target.value),
                        }))
                      }
                    />
                    <output>{selectedMaterialValue}%</output>
                  </label>
                ) : null}
                <div className="material-surface-toggle" role="group" aria-label={t('material.paintOn')}>
                  <button
                    type="button"
                    className={`chip tiny ${paintSurface === 'uv' ? 'active' : ''}`}
                    onClick={() => setPaintSurface('uv')}
                  >
                    {t('material.uvCanvas')}
                  </button>
                  <button
                    type="button"
                    className={`chip tiny ${paintSurface === 'model' ? 'active' : ''}`}
                    onClick={() => setPaintSurface('model')}
                  >
                    {t('material.3dModel')}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {isMaterialTicket && paintSurface === 'model' && modelGroup ? (
            <div className="canvas-model-view">
              <ModelPreview
                scene={modelGroup}
                tickets={groupTickets ?? []}
                focusPart={ticket.modelPart?.name}
                showMapControls={false}
                liveMap={activeMaterialChannel}
                liveCanvas={liveMaterialCanvasRef.current ?? undefined}
                liveVersion={liveMaterialVersion}
                liveTicketId={ticket.id}
                livePart={ticket.modelPart}
                paintMode={modelPaintMode}
                onOpenPart={onOpenTicket}
              />
            </div>
          ) : ready ? (
            <CanvasStage
              engine={engine}
              view={view}
              onViewChange={viewChange}
              settings={canvasSettings}
              onPickColor={handlePickColor}
              onCommit={scheduleSave}
              onLiveUpdate={isMaterialTicket ? updateLiveMaterial : undefined}
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
                aria-label={t('ribbon.lineWidth')}
                title={t('ribbon.lineWidth')}
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
                aria-label={t('tool.opacity')}
                title={t('tool.opacity')}
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

          {guidanceMap ? (
            <section className="side-section map-guidance">
              <div className="side-section-head">
                <h3>
                  <Icon name="layers" size={14} /> {t('editor.mapPanel')}
                </h3>
                <span className="map-cs">
                  {t(mapColorSpace(guidanceMap) === 'srgb' ? 'colorspace.srgb' : 'colorspace.linear')}
                </span>
              </div>
              <span className="map-chip">{t(`map.${guidanceMap}` as const)}</span>
              <p className="side-hint map-guidance-copy">{channelBrief || t(mapPurposeKey(guidanceMap))}</p>
              {modelGroup?.target ? <p className="side-hint packing-hint">{t(packingHintKey(modelGroup.target))}</p> : null}
            </section>
          ) : null}

          <section className="side-section external-section">
            <div className="side-section-head">
              <h3>
                <Icon name="upload" size={14} /> {t('editor.external')}
              </h3>
            </div>
            <p className="side-hint">{t('editor.externalHint')}</p>
            <div className="external-actions">
              <button className="ghost-button small" onClick={() => downloadTemplate('psd')}>
                <Icon name="download" size={14} /> {t('editor.templatePsd')}
              </button>
              <button className="ghost-button small" onClick={() => downloadTemplate('png')}>
                <Icon name="download" size={14} /> {t('editor.templatePng')}
              </button>
              <button className="primary-button small" onClick={() => uploadRef.current?.click()}>
                <Icon name="upload" size={14} /> {t('editor.upload')}
              </button>
            </div>
            <input
              ref={uploadRef}
              type="file"
              accept=".psd,image/*"
              style={{ display: 'none' }}
              onChange={(event) => {
                void handleUpload(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </section>

          <LayersPanel engine={engine} onChanged={scheduleSave} />
          <NotesPanel
            ticket={ticket}
            onAddNote={(body) => onAddNote(ticket.id, body)}
            onDeleteNote={(noteId) =>
              void onUpdateTicket(ticket.id, { notes: ticket.notes.filter((note) => note.id !== noteId) })
            }
          />
      </aside>

      <div className="editor-statusbar">
        <span className="statusbar-cell">
          {cursor
            ? t('status.position', { x: Math.round(cursor.x), y: Math.round(cursor.y) })
            : '–'}
        </span>
        <span className="statusbar-cell">{t('status.canvas', { w: dimensions.width, h: dimensions.height })}</span>
        {modeHint ? <span className="statusbar-hint">{modeHint}</span> : null}
        {saveState !== 'idle' ? (
          <span className={`statusbar-cell save-indicator ${saveState}`}>
            {saveState === 'saving' ? t('editor.saving') : t('editor.saved')}
          </span>
        ) : null}
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
        {modelGroup?.uvLayout && modelGroup.uvLayout.length > 0 ? (
          <button
            className={`statusbar-button ${view.showUvOverlay ? 'active' : ''}`}
            onClick={() => viewChange({ showUvOverlay: !view.showUvOverlay })}
            title={t('status.uvOverlay')}
            aria-label={t('status.uvOverlay')}
            aria-pressed={view.showUvOverlay}
          >
            <Icon name="layers" size={14} />
          </button>
        ) : null}
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

      {modelGroup ? (
        <>
        <div
          className="editor-preview-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('model.resizePreview')}
          aria-valuenow={previewWidth}
          aria-valuemin={220}
          aria-valuemax={720}
          tabIndex={0}
          onPointerDown={(event) => {
            previewResizeRef.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={resizePreview}
          onPointerUp={(event) => {
            if (previewResizeRef.current === event.pointerId) previewResizeRef.current = null;
          }}
          onPointerCancel={(event) => {
            if (previewResizeRef.current === event.pointerId) previewResizeRef.current = null;
          }}
          onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'ArrowLeft') setPreviewWidth((width) => Math.min(720, width + 24));
            if (event.key === 'ArrowRight') setPreviewWidth((width) => Math.max(220, width - 24));
          }}
        />
        <aside className="editor-preview-col">
          <div className="side-section-head">
            <h3>
              <Icon name="cube" size={14} /> {t('model.preview')}
            </h3>
          </div>
          <ModelPreview
            scene={modelGroup}
            tickets={groupTickets ?? []}
            onAttachModel={onAttachModel}
            liveMap={isMaterialTicket ? activeMaterialChannel : undefined}
            liveCanvas={isMaterialTicket ? liveMaterialCanvasRef.current ?? undefined : undefined}
            liveVersion={liveMaterialVersion}
            liveTicketId={isMaterialTicket ? ticket.id : undefined}
            livePart={isMaterialTicket ? ticket.modelPart : undefined}
            paintMode={modelPaintMode}
            onOpenPart={onOpenTicket}
          />
          {ticket.modelPart ? (
            <section className="part-model-preview">
              <div className="side-section-head">
                <h3>{t('model.partPreview', { part: ticket.modelPart.name })}</h3>
              </div>
              <ModelPreview
                scene={modelGroup}
                tickets={groupTickets ?? []}
                focusPart={ticket.modelPart.name}
                showMapControls={false}
                liveMap={isMaterialTicket ? activeMaterialChannel : undefined}
                liveCanvas={isMaterialTicket ? liveMaterialCanvasRef.current ?? undefined : undefined}
                liveVersion={liveMaterialVersion}
                liveTicketId={isMaterialTicket ? ticket.id : undefined}
                livePart={isMaterialTicket ? ticket.modelPart : undefined}
                paintMode={
                  isMaterialTicket && paintSurface === 'model'
                    ? modelPaintMode
                    : undefined
                }
                onOpenPart={onOpenTicket}
              />
            </section>
          ) : null}
        </aside>
        </>
      ) : null}

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
