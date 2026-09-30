import { useMemo } from 'react';
import type { Scene, Ticket } from '../types';
import { t } from '../i18n';
import { Icon } from './Icon';

interface GroupListProps {
  groups: Scene[];
  tickets: Ticket[];
  activeGroupId: string | 'all';
  onSelect: (id: string | 'all') => void;
  onOpenGuide: () => void;
  onLoadModelDemo: () => void;
  onLoadPaintedDemo: () => void;
}

export function GroupList({
  groups,
  tickets,
  activeGroupId,
  onSelect,
  onOpenGuide,
  onLoadModelDemo,
  onLoadPaintedDemo,
}: GroupListProps) {
  const counts = useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const ticket of tickets) {
      if (!ticket.sceneId) continue;
      const entry = map.get(ticket.sceneId) ?? { done: 0, total: 0 };
      entry.total += 1;
      if (ticket.status === 'complete') entry.done += 1;
      map.set(ticket.sceneId, entry);
    }
    return map;
  }, [tickets]);

  const allDone = tickets.filter((ticket) => ticket.status === 'complete').length;

  return (
    <aside className="group-panel">
      <div className="group-head">
        <h2>{t('set.groups')}</h2>
        <div className="group-head-actions">
          <button
            className="icon-button"
            title={t('model.loadDemo')}
            aria-label={t('model.loadDemo')}
            onClick={onLoadModelDemo}
          >
            <Icon name="cube" size={15} />
          </button>
          <button
            className="icon-button"
            title={t('model.loadPaintedDemo')}
            aria-label={t('model.loadPaintedDemo')}
            onClick={onLoadPaintedDemo}
          >
            <Icon name="brush" size={15} />
          </button>
          <button className="icon-button" title={t('app.aiGuide')} aria-label={t('app.aiGuide')} onClick={onOpenGuide}>
            <Icon name="bot" size={15} />
          </button>
        </div>
      </div>
      <div className="group-list">
        <button className={`group-item ${activeGroupId === 'all' ? 'active' : ''}`} onClick={() => onSelect('all')}>
          <Icon name="layers" size={15} />
          <span className="group-name">{t('set.all')}</span>
          <span className="group-count">
            {allDone}/{tickets.length}
          </span>
        </button>
        {groups.map((group) => {
          const count = counts.get(group.id) ?? { done: 0, total: group.items.length };
          return (
            <button
              key={group.id}
              className={`group-item ${activeGroupId === group.id ? 'active' : ''}`}
              onClick={() => onSelect(group.id)}
            >
              <Icon name={group.kind === 'model' ? 'cube' : 'layers'} size={15} />
              <span className="group-name">{group.name}</span>
              <span className="group-count">
                {count.done}/{count.total}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
