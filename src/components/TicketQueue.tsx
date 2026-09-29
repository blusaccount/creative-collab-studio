import { useMemo, useState } from 'react';
import type { Ticket, TicketStatus } from '../types';
import { STATUS_LABEL, TICKET_TYPES } from '../types';
import { Icon } from './Icon';

type SortKey = 'manual' | 'updated' | 'created' | 'title' | 'status';

interface TicketQueueProps {
  tickets: Ticket[];
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
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function TicketQueue({
  tickets,
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
  const [sortKey, setSortKey] = useState<SortKey>('manual');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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
  }, [tickets, statusFilter, typeFilter, search, sortKey]);

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
          <h2>Queue</h2>
          <span className="count">{tickets.length}</span>
        </div>
        <button className="primary-button full" onClick={onNewTicket}>
          <Icon name="plus" /> New ticket
        </button>
      </div>

      <div className="queue-filters">
        <div className="search-field">
          <Icon name="search" size={14} />
          <input
            value={search}
            placeholder="Search tickets"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="filter-row">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="active">Active</option>
            <option value="all">All statuses</option>
            <option value="backlog">Backlog</option>
            <option value="in-progress">In progress</option>
            <option value="review-ready">Review ready</option>
            <option value="complete">Complete</option>
            <option value="archived">Archived</option>
          </select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All types</option>
            {TICKET_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-row">
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="manual">Manual order</option>
            <option value="updated">Recently updated</option>
            <option value="created">Newest</option>
            <option value="title">Title A-Z</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      <div className="queue-list">
        {visible.length === 0 ? <p className="empty-state">No tickets match these filters.</p> : null}
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
              <span className={`status ${ticket.status}`}>{STATUS_LABEL[ticket.status]}</span>
            </div>
            <p className="ticket-meta">
              {ticket.type} · {ticket.dimensions.width}×{ticket.dimensions.height} ·{' '}
              {ticket.version > 1 ? `v${ticket.version} · ` : ''}
              {relativeTime(ticket.updatedAt)}
            </p>
            <div className="ticket-actions">
              {ticket.status !== 'complete' ? (
                <button
                  className="mini-button"
                  title="Mark complete"
                  onClick={(event) => {
                    event.stopPropagation();
                    onQuickStatus(ticket, 'complete');
                  }}
                >
                  <Icon name="check" size={13} /> Complete
                </button>
              ) : (
                <button
                  className="mini-button"
                  title="Reopen"
                  onClick={(event) => {
                    event.stopPropagation();
                    onQuickStatus(ticket, 'in-progress');
                  }}
                >
                  <Icon name="undo" size={13} /> Reopen
                </button>
              )}
              <button
                className="mini-button"
                title="Ticket settings"
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
