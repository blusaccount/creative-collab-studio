import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, Scene, SceneBlueprint, StudioSettings, Ticket } from '../types';
import { t } from '../i18n';
import { composeTicketCanvas } from '../drawing/compose';
import { validateBlueprint } from '../scenes/build';
import { slugify } from '../utils/naming';
import { downloadBlob } from '../utils/download';
import { Icon } from './Icon';
import { BlueprintImportDialog } from './BlueprintImportDialog';

interface SceneViewProps {
  project: Project | null;
  scenes: Scene[];
  activeScene: Scene | null;
  tickets: Ticket[];
  settings: StudioSettings;
  onSelectScene: (id: string) => void;
  onSelectGroup?: (id: string) => void;
  onImportBlueprint: (blueprint: SceneBlueprint) => void;
  onLoadDemo: () => void;
  onDeleteScene: (id: string) => void;
  onCompleteScene: (id: string) => void;
  onOpenTicket: (id: string) => void;
  onOpenGuide: () => void;
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

async function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  ticketById: Map<string, Ticket>,
  showPlaceholders: boolean,
): Promise<void> {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, scene.canvas.width, scene.canvas.height);
  ctx.fillStyle = scene.canvas.background;
  ctx.fillRect(0, 0, scene.canvas.width, scene.canvas.height);

  const items = [...scene.items].sort((a, b) => a.layer - b.layer);
  for (const item of items) {
    const ticket = ticketById.get(item.ticketId);
    if (ticket && ticket.status === 'complete') {
      const composed = await composeTicketCanvas(ticket);
      ctx.drawImage(composed, item.x, item.y, item.width, item.height);
    } else if (showPlaceholders) {
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(item.x + 0.5, item.y + 0.5, item.width - 1, item.height - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, item.x + item.width / 2, item.y + item.height / 2, item.width - 12);
      if (ticket) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.fillText(
          t(`status.${ticket.status}` as const),
          item.x + item.width / 2,
          item.y + item.height / 2 + 16,
          item.width - 12,
        );
      }
      ctx.restore();
    }
  }
}

export function SceneView({
  project,
  scenes,
  activeScene,
  tickets,
  onSelectScene,
  onSelectGroup,
  onImportBlueprint,
  onLoadDemo,
  onDeleteScene,
  onCompleteScene,
  onOpenTicket,
  onOpenGuide,
  notify,
}: SceneViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const ticketById = useMemo(() => new Map(tickets.map((ticket) => [ticket.id, ticket])), [tickets]);

  const items = useMemo(
    () => (activeScene ? [...activeScene.items].sort((a, b) => a.layer - b.layer) : []),
    [activeScene],
  );

  const completed = activeScene
    ? activeScene.items.filter((item) => ticketById.get(item.ticketId)?.status === 'complete').length
    : 0;
  const total = activeScene?.items.length ?? 0;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeScene) return;
    canvas.width = activeScene.canvas.width;
    canvas.height = activeScene.canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let cancelled = false;
    void drawScene(ctx, activeScene, ticketById, true).catch(() => {
      if (!cancelled) notify(t('toast.sceneRenderFailed'), 'error');
    });
    return () => {
      cancelled = true;
    };
  }, [activeScene, ticketById, notify]);

  const handleExport = async () => {
    if (!activeScene) return;
    setExporting(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = activeScene.canvas.width;
      canvas.height = activeScene.canvas.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      await drawScene(ctx, activeScene, ticketById, false);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
      if (!blob) throw new Error(t('toast.sceneExportFailed'));
      downloadBlob(blob, `${slugify(project?.name ?? 'project')}-${slugify(activeScene.name)}-scene.png`);
      notify(t('toast.sceneExported'), 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : t('toast.sceneExportFailed'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportBlueprint = () => {
    if (!activeScene) return;
    const blueprint: SceneBlueprint = {
      name: activeScene.name,
      description: activeScene.description,
      artDirection: activeScene.artDirection,
      canvas: activeScene.canvas,
      assets: items.map((item) => {
        const ticket = ticketById.get(item.ticketId);
        return {
          title: item.label,
          type: ticket?.type ?? 'prop',
          status: ticket?.status,
          dimensions: ticket?.dimensions ?? { width: item.width, height: item.height },
          background: ticket?.background ?? 'transparent',
          brief: ticket?.description ?? '',
          layout: { x: item.x, y: item.y, width: item.width, height: item.height, layer: item.layer },
        };
      }),
    };
    const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${slugify(activeScene.name)}-blueprint.json`);
    notify(t('toast.planExported'), 'success');
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const blueprint = validateBlueprint(parsed);
        if (!blueprint) throw new Error(t('toast.invalidBlueprint'));
        onImportBlueprint(blueprint);
        const count = (blueprint.assets?.length ?? 0) + (blueprint.maps?.length ?? 0);
        notify(t('toast.blueprintImported', { name: blueprint.name, count }), 'success');
      } catch (error) {
        notify(error instanceof Error ? error.message : t('toast.importFailed'), 'error');
      }
    };
    reader.readAsText(file);
  };

  if (!activeScene) {
    return (
      <section className="scene-panel empty">
        <Icon name="layers" size={40} />
        <h2>{t('scene.empty.title')}</h2>
        <p>{t('scene.empty.body')}</p>
        <div className="scene-empty-actions">
          <button className="primary-button" onClick={() => setShowImport(true)}>
            <Icon name="bot" size={15} /> {t('scene.pasteFromAi')}
          </button>
          <button className="ghost-button" onClick={onLoadDemo}>
            <Icon name="plus" size={15} /> {t('scene.loadDemo')}
          </button>
          <button className="ghost-button" onClick={() => fileRef.current?.click()}>
            <Icon name="folder" size={15} /> {t('scene.importJson')}
          </button>
          <button className="ghost-button" onClick={onOpenGuide}>
            <Icon name="info" size={15} /> {t('app.aiGuide')}
          </button>
        </div>
        {showImport ? (
          <BlueprintImportDialog onClose={() => setShowImport(false)} onImport={onImportBlueprint} />
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </section>
    );
  }

  const allComplete = total > 0 && completed === total;

  return (
    <section className="scene-panel">
      <div className="scene-head">
        <div>
          <p className="eyebrow">{t('scene.eyebrow')}</p>
          <h2>{activeScene.name}</h2>
          <p className="scene-direction">{activeScene.artDirection}</p>
        </div>
        <div className="scene-head-actions">
          {scenes.length > 1 ? (
            <select
              value={activeScene.id}
              onChange={(event) => (onSelectGroup ?? onSelectScene)(event.target.value)}
            >
              {scenes.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.name}
                </option>
              ))}
            </select>
          ) : null}
          <button className="primary-button" onClick={() => setShowImport(true)}>
            <Icon name="bot" size={15} /> {t('scene.pasteFromAi')}
          </button>
          <button className="ghost-button" onClick={onOpenGuide}>
            <Icon name="info" size={15} /> {t('app.aiGuide')}
          </button>
          <button className="ghost-button" onClick={() => fileRef.current?.click()}>
            <Icon name="folder" size={15} /> {t('scene.import')}
          </button>
          <button className="ghost-button" onClick={onLoadDemo}>
            <Icon name="plus" size={15} /> {t('scene.loadDemoShort')}
          </button>
          <button className="ghost-button" onClick={handleExportBlueprint}>
            <Icon name="save" size={15} /> {t('scene.exportPlan')}
          </button>
          <button
            className="ghost-button danger-text"
            onClick={() => {
              if (window.confirm(t('scene.deleteConfirm', { name: activeScene.name, count: total }))) {
                onDeleteScene(activeScene.id);
              }
            }}
          >
            <Icon name="trash" size={15} /> {t('scene.delete')}
          </button>
          <button className="ghost-button" onClick={handleExport} disabled={exporting}>
            <Icon name="download" size={15} /> {exporting ? t('scene.exporting') : t('scene.export')}
          </button>
        </div>
      </div>

      {showImport ? (
        <BlueprintImportDialog onClose={() => setShowImport(false)} onImport={onImportBlueprint} />
      ) : null}

      <div className="scene-progress">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="scene-progress-label">
          {t('scene.progress', { completed, total, percent: progress })}
        </span>
        {allComplete ? (
          activeScene.completedAt ? (
            <span className="scene-done">
              <Icon name="check" size={14} /> {t('scene.finished')}
            </span>
          ) : (
            <button className="primary-button small" onClick={() => onCompleteScene(activeScene.id)}>
              <Icon name="check" size={14} /> {t('scene.finish')}
            </button>
          )
        ) : null}
      </div>

      <div className="scene-body">
        <div className="scene-board-wrap">
          <canvas ref={canvasRef} className="scene-board" />
        </div>

        <aside className="scene-inspector">
          <div className="side-section-head">
            <h3>{t('scene.slots')}</h3>
            <span className="count">
              {completed}/{total}
            </span>
          </div>
          <div className="scene-slot-list">
            {items.map((item) => {
              const ticket = ticketById.get(item.ticketId);
              return (
                <button
                  key={item.id}
                  className={`scene-slot ${ticket?.status === 'complete' ? 'done' : ''}`}
                  onClick={() => ticket && onOpenTicket(ticket.id)}
                  disabled={!ticket}
                >
                  <span className={`slot-dot ${ticket?.status ?? 'missing'}`} />
                  <span className="slot-info">
                    <span className="slot-label">{item.label}</span>
                    <span className="slot-meta">
                      {ticket
                        ? `${t(`type.${ticket.type}` as const)} · ${ticket.dimensions.width}×${ticket.dimensions.height}`
                        : t('scene.missing')}
                    </span>
                  </span>
                  <span className="slot-status">{ticket ? t(`status.${ticket.status}` as const) : '—'}</span>
                </button>
              );
            })}
          </div>
          {activeScene.description ? (
            <div className="scene-note">
              <h4>{t('scene.brief')}</h4>
              <p>{activeScene.description}</p>
            </div>
          ) : null}
        </aside>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </section>
  );
}
