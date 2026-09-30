import { useEffect, useMemo, useState } from 'react';
import type { Scene, Ticket, TicketStatus } from '../types';
import { TICKET_TYPES, TICKET_STATUSES } from '../types';
import { t, getLocale } from '../i18n';
import { Icon } from './Icon';

type SortKey = 'manual' | 'updated' | 'created' | 'title' | 'status';

interface TicketQueueProps {
  tickets: Ticket[];
  scenes: Scene[];
  activeTicketId: string | null;
  onSelect: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onNewTicket: () => void;
  onOpenSettings: (ticket: Ticket) => void;
  onQuickStatus: (ticket: Ticket, status: TicketStatus) => void;
}

const STATUS_ORDER: Record<TicketStatus, number> = {
  'in-progress': 0,
  'review-ready': 1,
  backlog: 2,
  complete: 3,
  archived: 4,
};

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutes', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('time.hours', { n: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return t('time.days', { n: days });
  return new Date(timestamp).toLocaleDateString(getLocale());
}

export function TicketQueue({
  tickets,
  scenes,
  activeTicketId,
  onSelect,
  onReorder,
  onNewTicket,
  onOpenSettings,
  onQuickStatus,
}: TicketQueueProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | TicketStatus>('active');
  const [typeFilter, setTypeFilter] = useState<'all' | string>('all');
  const [sceneFilter, setSceneFilter] = useState<'all' | string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('manual');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Refresh relative timestamps once a minute.
  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const sceneNames = useMemo(
    () => new Map(scenes.map((scene) => [scene.id, scene.name])),
    [scenes],
  );

  const visible = useMemo(() => {
    let list = [...tickets];
    if (statusFilter === 'active') {
      list = list.filter((ticket) => ticket.status !== 'archived' && ticket.status !== 'complete');
    } else if (statusFilter !== 'all') {
      list = list.filter((ticket) => ticket.status === statusFilter);
    }
    if (typeFilter !== 'all') {
      list = list.filter((ticket) => ticket.type === typeFilter);
    }
    if (sceneFilter !== 'all') {
      list = list.filter((ticket) => ticket.sceneId === sceneFilter);
    }
    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (ticket) =>
          ticket.title.toLowerCase().includes(query) || ticket.description.toLowerCase().includes(query),
      );
    }
    if (sortKey === 'manual') {
      list.sort((a, b) => a.order - b.order);
    } else if (sortKey === 'updated') {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    } else if (sortKey === 'created') {
      list.sort((a, b) => b.createdAt - a.createdAt);
    } else if (sortKey === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      list.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.order - b.order);
    }
    return list;
  }, [tickets, statusFilter, typeFilter, sceneFilter, search, sortKey]);

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const manualOrder = [...tickets].sort((a, b) => a.order - b.order).map((ticket) => ticket.id);
    const fromIndex = manualOrder.indexOf(dragId);
    const toIndex = manualOrder.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    manualOrder.splice(fromIndex, 1);
    manualOrder.splice(toIndex, 0, dragId);
    onReorder(manualOrder);
    setDragId(null);
    setDragOverId(null);
  };

  return (
    <aside className="queue-panel">
      <div className="queue-head">
        <div className="panel-header">
          <h2>{t('queue.title')}</h2>
          <span className="count">{tickets.length}</span>
        </div>
        <button className="primary-button full" onClick={onNewTicket}>
          <Icon name="plus" /> {t('queue.newTicket')}
        </button>
      </div>

      <div className="queue-filters">
        <div className="search-field">
          <Icon name="search" size={14} />
          <input
            value={search}
            placeholder={t('queue.search')}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="filter-row">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="active">{t('queue.filter.active')}</option>
            <option value="all">{t('queue.filter.allStatus')}</option>
            {TICKET_STATUSES.filter((status) => status !== 'archived').map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}` as const)}
              </option>
            ))}
          </select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">{t('queue.filter.allTypes')}</option>
            {TICKET_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`type.${type}` as const)}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-row">
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="manual">{t('queue.sort.manual')}</option>
            <option value="updated">{t('queue.sort.updated')}</option>
            <option value="created">{t('queue.sort.created')}</option>
            <option value="title">{t('queue.sort.title')}</option>
            <option value="status">{t('queue.sort.status')}</option>
          </select>
          {scenes.length > 0 ? (
            <select value={sceneFilter} onChange={(event) => setSceneFilter(event.target.value)}>
              <option value="all">{t('queue.filter.allScenes')}</option>
              {scenes.map((scene) => (
                <option key={scene.id} value={scene.id}>
                  {scene.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      <div className="queue-list">
        {visible.length === 0 ? <p className="empty-state">{t('queue.empty')}</p> : null}
        {visible.map((ticket) => (
          <article
            key={ticket.id}
            className={`ticket-card ${activeTicketId === ticket.id ? 'selected' : ''} ${
              dragOverId === ticket.id ? 'drag-over' : ''
            }`}
            draggable={sortKey === 'manual'}
            onDragStart={() => setDragId(ticket.id)}
            onDragEnd={() => {
              setDragId(null);
              setDragOverId(null);
            }}
            onDragOver={(event) => {
              if (sortKey !== 'manual') return;
              event.preventDefault();
              setDragOverId(ticket.id);
            }}
            onDrop={() => handleDrop(ticket.id)}
            onClick={() => onSelect(ticket.id)}
          >
            <div className="ticket-row">
              <span className="ticket-name">{ticket.title}</span>
              <span className={`status ${ticket.status}`}>{t(`status.${ticket.status}` as const)}</span>
            </div>
            {ticket.sceneId && sceneNames.has(ticket.sceneId) ? (
              <span className="scene-tag">
                <Icon name="layers" size={11} /> {sceneNames.get(ticket.sceneId)}
              </span>
            ) : null}
            <p className="ticket-meta">
              {t(`type.${ticket.type}` as const)} · {ticket.dimensions.width}×{ticket.dimensions.height} ·{' '}
              {ticket.version > 1 ? `v${ticket.version} · ` : ''}
              {relativeTime(ticket.updatedAt)}
            </p>
            <div className="ticket-actions">
              {ticket.status !== 'complete' ? (
                <button
                  className="mini-button"
                  title={t('queue.action.markComplete')}
                  onClick={(event) => {
                    event.stopPropagation();
                    onQuickStatus(ticket, 'complete');
                  }}
                >
                  <Icon name="check" size={13} /> {t('queue.action.complete')}
                </button>
              ) : (
                <button
                  className="mini-button"
                  title={t('queue.action.reopenTitle')}
                  onClick={(event) => {
                    event.stopPropagation();
                    onQuickStatus(ticket, 'in-progress');
                  }}
                >
                  <Icon name="undo" size={13} /> {t('queue.action.reopen')}
                </button>
              )}
              <button
                className="mini-button"
                title={t('queue.action.settings')}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenSettings(ticket);
                }}
              >
                <Icon name="settings" size={13} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}
