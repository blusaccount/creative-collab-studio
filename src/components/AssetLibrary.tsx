import { useEffect, useMemo, useState } from 'react';
import type { Project, StudioSettings, Ticket, TicketStatus } from '../types';
import { STATUS_LABEL, TICKET_TYPES } from '../types';
import { composeTicketBlob, composeTicketThumbnail } from '../drawing/compose';
import { buildAssetFilename, buildAssetSubfolders } from '../utils/naming';
import { downloadBlob, pickDirectory, supportsDirectoryExport, writeFileToDirectory } from '../utils/download';
import { Icon } from './Icon';

interface AssetLibraryProps {
  project: Project | null;
  tickets: Ticket[];
  settings: StudioSettings;
  onOpenTicket: (id: string) => void;
  onExportTicket: (ticket: Ticket) => void;
  notify: (message: string, tone?: 'info' | 'success' | 'error') => void;
}

type SortKey = 'updated' | 'created' | 'title' | 'type';

export function AssetLibrary({
  project,
  tickets,
  settings,
  onOpenTicket,
  onExportTicket,
  notify,
}: AssetLibraryProps) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'complete' | 'review-ready' | 'all'>('complete');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    let list = [...tickets];
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
  }, [tickets, statusFilter, typeFilter, search, sortKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const ticket of visible) {
        if (thumbs[ticket.id]) continue;
        const url = await composeTicketThumbnail(ticket);
        if (cancelled) return;
        setThumbs((current) => ({ ...current, [ticket.id]: url }));
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
      notify('Select at least one asset to export', 'error');
      return;
    }
    setBusy(true);
    try {
      if (supportsDirectoryExport()) {
        const directory = await pickDirectory();
        if (!directory) return;
        for (const ticket of chosen) {
          const blob = await composeTicketBlob(ticket);
          if (!blob) continue;
          await writeFileToDirectory(
            directory,
            buildAssetSubfolders(ticket, project),
            buildAssetFilename(ticket, project, settings),
            blob,
          );
        }
        notify(`Exported ${chosen.length} asset(s) to “${directory.name}”`, 'success');
      } else {
        for (const ticket of chosen) {
          const blob = await composeTicketBlob(ticket);
          if (blob) downloadBlob(blob, buildAssetFilename(ticket, project, settings));
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        notify(`Downloaded ${chosen.length} asset(s)`, 'success');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Batch export failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const completedCount = tickets.filter((ticket) => ticket.status === 'complete').length;

  return (
    <section className="library-panel">
      <div className="library-head">
        <div>
          <p className="eyebrow">Asset library</p>
          <h2>{project?.name ?? 'Project'} assets</h2>
          <p className="library-sub">
            {completedCount} completed · {tickets.length} total tickets
          </p>
        </div>
        <div className="library-actions">
          <button className="ghost-button" onClick={selectAllVisible} disabled={visible.length === 0}>
            Select all
          </button>
          <button className="ghost-button" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
            Clear selection
          </button>
          <button className="primary-button" onClick={exportSelection} disabled={busy || selected.size === 0}>
            <Icon name="folder" size={15} />
            {busy ? 'Exporting…' : `Export ${selected.size || ''} to folder`}
          </button>
        </div>
      </div>

      <div className="library-filters">
        <div className="search-field">
          <Icon name="search" size={14} />
          <input value={search} placeholder="Search assets" onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
          <option value="complete">Completed</option>
          <option value="review-ready">Complete + review ready</option>
          <option value="all">All statuses</option>
        </select>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">All types</option>
          {TICKET_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
          <option value="updated">Recently updated</option>
          <option value="created">Newest</option>
          <option value="title">Title A-Z</option>
          <option value="type">Type</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="empty-state">
          No assets yet. Mark a ticket as complete and it will show up here, ready to export.
        </p>
      ) : (
        <div className="asset-grid">
          {visible.map((ticket) => (
            <article key={ticket.id} className={`asset-card ${selected.has(ticket.id) ? 'selected' : ''}`}>
              <button
                className="asset-thumb"
                onClick={() => toggle(ticket.id)}
                title="Toggle selection"
              >
                {thumbs[ticket.id] ? (
                  <img src={thumbs[ticket.id]} alt={ticket.title} />
                ) : (
                  <span className="thumb-placeholder">rendering…</span>
                )}
                <span className="asset-check">
                  <Icon name={selected.has(ticket.id) ? 'check' : 'plus'} size={13} />
                </span>
              </button>
              <div className="asset-info">
                <div className="ticket-row">
                  <span className="asset-title">{ticket.title}</span>
                  <span className={`status ${ticket.status}`}>{STATUS_LABEL[ticket.status as TicketStatus]}</span>
                </div>
                <p className="ticket-meta">
                  {ticket.type} · {ticket.dimensions.width}×{ticket.dimensions.height} · v{ticket.version}
                </p>
                <div className="asset-card-actions">
                  <button className="mini-button" onClick={() => onOpenTicket(ticket.id)}>
                    <Icon name="edit" size={13} /> Open
                  </button>
                  <button className="mini-button" onClick={() => onExportTicket(ticket)}>
                    <Icon name="download" size={13} /> Export PNG
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
