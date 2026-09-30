import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, StudioSettings, Ticket } from '../types';
import { TICKET_TYPES } from '../types';
import { t } from '../i18n';
import { composeTicketBlob, composeTicketThumbnail } from '../drawing/compose';
import { buildAssetFilename, buildAssetSubfolders } from '../utils/naming';
import { downloadBlob, pickDirectory, supportsDirectoryExport, writeFileToDirectory } from '../utils/download';
import { Icon } from './Icon';

interface AssetLibraryProps {
  project: Project | null;
  tickets: Ticket[];
  groupFilter: string | 'all';
  settings: StudioSettings;
  onOpenTicket: (id: string) => void;
  onExportTicket: (ticket: Ticket) => void;
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

type SortKey = 'updated' | 'created' | 'title' | 'type';

export function AssetLibrary({
  project,
  tickets,
  groupFilter,
  settings,
  onOpenTicket,
  onExportTicket,
  notify,
}: AssetLibraryProps) {
  const [thumbs, setThumbs] = useState<Record<string, { sig: string; url: string }>>({});
  const thumbsRef = useRef(thumbs);
  thumbsRef.current = thumbs;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'complete' | 'review-ready' | 'all'>('complete');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    let list = [...tickets];
    if (groupFilter !== 'all') list = list.filter((ticket) => ticket.sceneId === groupFilter);
    if (statusFilter === 'complete') list = list.filter((ticket) => ticket.status === 'complete');
    else if (statusFilter === 'review-ready')
      list = list.filter((ticket) => ticket.status === 'complete' || ticket.status === 'review-ready');
    if (typeFilter !== 'all') list = list.filter((ticket) => ticket.type === typeFilter);
    const query = search.trim().toLowerCase();
    if (query) list = list.filter((ticket) => ticket.title.toLowerCase().includes(query));
    if (sortKey === 'updated') list.sort((a, b) => b.updatedAt - a.updatedAt);
    else if (sortKey === 'created') list.sort((a, b) => b.createdAt - a.createdAt);
    else if (sortKey === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    else list.sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title));
    return list;
  }, [tickets, groupFilter, statusFilter, typeFilter, search, sortKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const ticket of visible) {
        const sig = `${ticket.updatedAt}:${ticket.version}`;
        if (thumbsRef.current[ticket.id]?.sig === sig) continue;
        const url = await composeTicketThumbnail(ticket);
        if (cancelled) return;
        setThumbs((current) => ({ ...current, [ticket.id]: { sig, url } }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(new Set(visible.map((ticket) => ticket.id)));
  };

  const exportSelection = async () => {
    const chosen = visible.filter((ticket) => selected.has(ticket.id));
    if (chosen.length === 0) {
      notify(t('toast.selectAsset'), 'error');
      return;
    }
    setBusy(true);
    try {
      if (supportsDirectoryExport()) {
        const directory = await pickDirectory();
        if (!directory) return;
        for (const ticket of chosen) {
          const blob = await composeTicketBlob(ticket, settings.trimOnExport);
          if (!blob) continue;
          await writeFileToDirectory(
            directory,
            buildAssetSubfolders(ticket, project),
            buildAssetFilename(ticket, project, settings),
            blob,
          );
        }
        notify(t('toast.exportedToFolder', { count: chosen.length, folder: directory.name }), 'success');
      } else {
        for (const ticket of chosen) {
          const blob = await composeTicketBlob(ticket, settings.trimOnExport);
          if (blob) downloadBlob(blob, buildAssetFilename(ticket, project, settings));
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        notify(t('toast.downloaded', { count: chosen.length }), 'success');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : t('toast.batchFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const completedCount = tickets.filter((ticket) => ticket.status === 'complete').length;

  return (
    <section className="library-panel">
      <div className="library-head">
        <div>
          <p className="eyebrow">{t('library.eyebrow')}</p>
          <h2>{t('library.title', { project: project?.name ?? 'Projekt' })}</h2>
          <p className="library-sub">
            {t('library.subtitle', { completed: completedCount, total: tickets.length })}
          </p>
        </div>
        <div className="library-actions">
          <button className="ghost-button" onClick={selectAllVisible} disabled={visible.length === 0}>
            {t('library.selectAll')}
          </button>
          <button className="ghost-button" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
            {t('library.clearSelection')}
          </button>
          <button className="primary-button" onClick={exportSelection} disabled={busy || selected.size === 0}>
            <Icon name="folder" size={15} />
            {busy
              ? t('library.exporting')
              : selected.size > 0
                ? t('library.exportCount', { count: selected.size })
                : t('library.exportToFolder')}
          </button>
        </div>
      </div>

      <div className="library-filters">
        <div className="search-field">
          <Icon name="search" size={14} />
          <input value={search} placeholder={t('library.search')} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
          <option value="complete">{t('library.status.complete')}</option>
          <option value="review-ready">{t('library.status.reviewReady')}</option>
          <option value="all">{t('library.status.all')}</option>
        </select>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">{t('queue.filter.allTypes')}</option>
          {TICKET_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`type.${type}` as const)}
            </option>
          ))}
        </select>
        <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
          <option value="updated">{t('queue.sort.updated')}</option>
          <option value="created">{t('queue.sort.created')}</option>
          <option value="title">{t('library.sort.title')}</option>
          <option value="type">{t('library.sort.type')}</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="empty-state">{t('library.empty')}</p>
      ) : (
        <div className="asset-grid">
          {visible.map((ticket) => (
            <article key={ticket.id} className={`asset-card ${selected.has(ticket.id) ? 'selected' : ''}`}>
              <button className="asset-thumb" onClick={() => toggle(ticket.id)} title={t('library.toggleSelect')}>
                {thumbs[ticket.id]?.url ? (
                  <img src={thumbs[ticket.id].url} alt={ticket.title} />
                ) : (
                  <span className="thumb-placeholder">{t('library.rendering')}</span>
                )}
                <span className="asset-check">
                  <Icon name={selected.has(ticket.id) ? 'check' : 'plus'} size={13} />
                </span>
              </button>
              <div className="asset-info">
                <div className="ticket-row">
                  <span className="asset-title">{ticket.title}</span>
                  <span className={`status ${ticket.status}`}>{t(`status.${ticket.status}` as const)}</span>
                </div>
                <p className="ticket-meta">
                  {t(`type.${ticket.type}` as const)} · {ticket.dimensions.width}×{ticket.dimensions.height} · v
                  {ticket.version}
                </p>
                <div className="asset-card-actions">
                  <button className="mini-button" onClick={() => onOpenTicket(ticket.id)}>
                    <Icon name="edit" size={13} /> {t('library.open')}
                  </button>
                  <button className="mini-button" onClick={() => onExportTicket(ticket)}>
                    <Icon name="download" size={13} /> {t('library.exportPng')}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
