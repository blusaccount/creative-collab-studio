import { useEffect, useMemo, useRef, useState } from 'react';
import type { EngineTarget, Project, Scene, SceneBlueprint, StudioSettings, Ticket } from '../types';
import { t } from '../i18n';
import { composeTicketBlob, composeTicketThumbnail } from '../drawing/compose';
import { mapSortIndex } from '../scenes/maps';
import { slugify } from '../utils/naming';
import { downloadBlob } from '../utils/download';
import { Icon } from './Icon';
import { BlueprintImportDialog } from './BlueprintImportDialog';
import { ModelPreview } from './ModelPreview';
import { ConfirmDialog } from './Modal';
import { ENGINE_TARGETS } from '../scenes/maps';

interface ModelBoardProps {
  project: Project | null;
  activeScene: Scene;
  tickets: Ticket[];
  settings: StudioSettings;
  onImportBlueprint: (blueprint: SceneBlueprint) => void;
  onLoadDemo: () => void;
  onDeleteScene: (id: string) => void;
  onCompleteScene: (id: string) => void;
  onUpdateScene: (id: string, patch: Partial<Scene>) => void;
  onOpenTicket: (id: string) => void;
  onOpenGuide: () => void;
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

export function ModelBoard({
  project,
  activeScene,
  tickets,
  settings,
  onImportBlueprint,
  onLoadDemo,
  onDeleteScene,
  onCompleteScene,
  onUpdateScene,
  onOpenTicket,
  onOpenGuide,
  notify,
}: ModelBoardProps) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [showImport, setShowImport] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const uvInputRef = useRef<HTMLInputElement | null>(null);
  const modelInputRef = useRef<HTMLInputElement | null>(null);

  const ticketById = useMemo(() => new Map(tickets.map((ticket) => [ticket.id, ticket])), [tickets]);
  const items = useMemo(
    () =>
      [...activeScene.items].sort(
        (a, b) =>
          mapSortIndex(ticketById.get(a.ticketId)?.mapType) - mapSortIndex(ticketById.get(b.ticketId)?.mapType),
      ),
    [activeScene.items, ticketById],
  );

  const modelTickets = useMemo(
    () => items.map((item) => ticketById.get(item.ticketId)).filter((ticket): ticket is Ticket => Boolean(ticket)),
    [items, ticketById],
  );
  const completed = items.filter((item) => ticketById.get(item.ticketId)?.status === 'complete').length;
  const total = items.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const item of items) {
        const ticket = ticketById.get(item.ticketId);
        if (!ticket || thumbs[ticket.id]) continue;
        const url = await composeTicketThumbnail(ticket, 180);
        if (cancelled) return;
        if (url) setThumbs((current) => ({ ...current, [ticket.id]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const exportSet = async () => {
    setExporting(true);
    try {
      const base = slugify(activeScene.name);
      for (const item of items) {
        const ticket = ticketById.get(item.ticketId);
        if (!ticket) continue;
        const blob = await composeTicketBlob(ticket, settings.trimOnExport);
        if (!blob) continue;
        const mapName = ticket.mapType ? ticket.mapType : slugify(ticket.title);
        downloadBlob(blob, `${base}_${mapName}.png`);
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
      notify(t('toast.exported'), 'success');
    } catch {
      notify(t('toast.batchFailed'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const exportPlan = () => {
    const blueprint: SceneBlueprint = {
      kind: 'model',
      name: activeScene.name,
      description: activeScene.description,
      artDirection: activeScene.artDirection,
      target: activeScene.target,
      uvTemplate: activeScene.uvTemplate,
      uvLayout: activeScene.uvLayout,
      mesh: activeScene.mesh,
      modelUrl: activeScene.modelFile?.url,
      modelName: activeScene.modelFile?.name,
      canvas: activeScene.canvas,
      maps: items.map((item) => {
        const ticket = ticketById.get(item.ticketId);
        return {
          map: ticket?.mapType ?? 'other',
          title: ticket?.title,
          brief: ticket?.description ?? '',
          dimensions: ticket?.dimensions,
        };
      }),
    };
    const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${slugify(activeScene.name)}-blueprint.json`);
    notify(t('toast.planExported'), 'success');
  };

  const onUvFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateScene(activeScene.id, { uvTemplate: reader.result });
        notify(t('editor.toast.referenceLoaded'), 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  const onModelFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateScene(activeScene.id, { modelFile: { name: file.name, dataUrl: reader.result } });
        notify(t('model.modelAttached', { name: file.name }), 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <section className="scene-panel">
      <div className="scene-head">
        <div>
          <p className="eyebrow">
            <Icon name="cube" size={12} /> {t('set.kind.model')}
          </p>
          <h2>{activeScene.name}</h2>
          <p className="scene-direction">{activeScene.artDirection || activeScene.description}</p>
        </div>
        <div className="scene-head-actions">
          <button className="primary-button" onClick={() => setShowImport(true)}>
            <Icon name="bot" size={15} /> {t('scene.pasteFromAi')}
          </button>
          <button className="ghost-button" onClick={onOpenGuide}>
            <Icon name="info" size={15} /> {t('app.aiGuide')}
          </button>
          <button className="ghost-button" onClick={onLoadDemo}>
            <Icon name="plus" size={15} /> {t('scene.loadDemoShort')}
          </button>
          <button className="ghost-button" onClick={exportPlan}>
            <Icon name="save" size={15} /> {t('scene.exportPlan')}
          </button>
          <button className="ghost-button danger-text" onClick={() => setShowDelete(true)}>
            <Icon name="trash" size={15} /> {t('scene.delete')}
          </button>
          <button className="primary-button" onClick={exportSet} disabled={exporting}>
            <Icon name="download" size={15} /> {exporting ? t('scene.exporting') : t('model.exportSet')}
          </button>
        </div>
      </div>

      <div className="scene-progress">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="scene-progress-label">{t('model.progress', { completed, total, percent: progress })}</span>
        {activeScene.target ? (
          <span className="model-engine">
            {t('engine.target')}: {t(`engine.${activeScene.target}` as const)}
          </span>
        ) : null}
        {total > 0 && completed === total ? (
          activeScene.completedAt ? (
            <span className="scene-done">
              <Icon name="check" size={14} /> {t('set.finished')}
            </span>
          ) : (
            <button className="primary-button small" onClick={() => onCompleteScene(activeScene.id)}>
              <Icon name="check" size={14} /> {t('set.finish')}
            </button>
          )
        ) : null}
      </div>

      <div className="scene-body">
        <div className="model-main">
          <div className="asset-grid">
            {items.map((item) => {
              const ticket = ticketById.get(item.ticketId);
              if (!ticket) return null;
              return (
                <article key={item.id} className="asset-card">
                  <button className="asset-thumb" onClick={() => onOpenTicket(ticket.id)} title={t('library.open')}>
                    {thumbs[ticket.id] ? (
                      <img src={thumbs[ticket.id]} alt={ticket.title} />
                    ) : (
                      <span className="thumb-placeholder">{t('library.rendering')}</span>
                    )}
                  </button>
                  <div className="asset-info">
                    <div className="ticket-row">
                      <span className="asset-title">
                        {ticket.mapType ? t(`map.${ticket.mapType}` as const) : ticket.title}
                      </span>
                      <span className={`status ${ticket.status}`}>{t(`status.${ticket.status}` as const)}</span>
                    </div>
                    <p className="ticket-meta">
                      {ticket.dimensions.width}×{ticket.dimensions.height} ·{' '}
                      {ticket.mapType ? t(`map.${ticket.mapType}` as const) : ''}
                    </p>
                    <div className="asset-card-actions">
                      <button className="mini-button" onClick={() => onOpenTicket(ticket.id)}>
                        <Icon name="edit" size={13} /> {t('library.open')}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="scene-inspector">
          <div className="side-section-head">
            <h3>{t('model.settings')}</h3>
          </div>
          <label className="pr-select vertical">
            <span>{t('engine.target')}</span>
            <select
              value={activeScene.target ?? ''}
              onChange={(event) =>
                onUpdateScene(activeScene.id, {
                  target: (event.target.value || undefined) as EngineTarget | undefined,
                })
              }
            >
              <option value="">—</option>
              {ENGINE_TARGETS.map((engine) => (
                <option key={engine} value={engine}>
                  {t(`engine.${engine}` as const)}
                </option>
              ))}
            </select>
          </label>

          <div className="side-section-head">
            <h3>{t('model.uv')}</h3>
          </div>
          {activeScene.uvTemplate ? (
            <img className="uv-preview" src={activeScene.uvTemplate} alt={t('model.uv')} />
          ) : (
            <p className="empty-state">{t('model.noUv')}</p>
          )}
          <button className="ghost-button small" onClick={() => uvInputRef.current?.click()}>
            <Icon name="upload" size={14} /> {t('model.uvUpload')}
          </button>

          <div className="side-section-head">
            <h3>{t('model.modelUpload')}</h3>
          </div>
          <p className="side-hint">
            {activeScene.modelFile ? t('model.modelAttached', { name: activeScene.modelFile.name }) : t('model.noModel')}
          </p>
          <button className="ghost-button small" onClick={() => modelInputRef.current?.click()}>
            <Icon name="cube" size={14} /> {t('model.modelUpload')}
          </button>

          <div className="side-section-head">
            <h3>{t('model.preview')}</h3>
          </div>
          <ModelPreview scene={activeScene} tickets={modelTickets} onAttachModel={onModelFile} />
          <p className="side-hint">{t('model.previewHint')}</p>

          <input
            ref={uvInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(event) => {
              onUvFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <input
            ref={modelInputRef}
            type="file"
            accept=".glb,.gltf,.fbx,.obj,model/*"
            style={{ display: 'none' }}
            onChange={(event) => {
              onModelFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </aside>
      </div>

      {showImport ? (
        <BlueprintImportDialog onClose={() => setShowImport(false)} onImport={onImportBlueprint} />
      ) : null}

      {showDelete ? (
        <ConfirmDialog
          title={t('confirm.deleteGroup.title')}
          message={t('confirm.deleteGroup.body', { name: activeScene.name })}
          confirmLabel={t('common.delete')}
          danger
          onCancel={() => setShowDelete(false)}
          onConfirm={() => {
            setShowDelete(false);
            onDeleteScene(activeScene.id);
          }}
        />
      ) : null}
    </section>
  );
}
