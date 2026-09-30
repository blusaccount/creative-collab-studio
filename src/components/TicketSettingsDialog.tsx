import { useState } from 'react';
import { BACKGROUND_KINDS, TICKET_STATUSES, TICKET_TYPES } from '../types';
import type { BackgroundKind, Ticket, TicketStatus, TicketType } from '../types';
import { t } from '../i18n';
import { Modal } from './Modal';
import { Icon } from './Icon';

interface TicketSettingsDialogProps {
  ticket: Ticket;
  onClose: () => void;
  onSave: (patch: Partial<Ticket>) => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function TicketSettingsDialog({
  ticket,
  onClose,
  onSave,
  onArchive,
  onDelete,
}: TicketSettingsDialogProps) {
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description);
  const [type, setType] = useState<TicketType>(ticket.type);
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [width, setWidth] = useState(ticket.dimensions.width);
  const [height, setHeight] = useState(ticket.dimensions.height);
  const [background, setBackground] = useState<BackgroundKind>(ticket.background);

  const dimensionsChanged =
    width !== ticket.dimensions.width || height !== ticket.dimensions.height;

  const save = () => {
    onSave({
      title: title.trim() || ticket.title,
      description,
      type,
      status,
      dimensions: {
        width: Math.max(1, Math.min(4096, Math.round(width) || 1)),
        height: Math.max(1, Math.min(4096, Math.round(height) || 1)),
      },
      background,
      completedAt: status === 'complete' ? ticket.completedAt ?? Date.now() : ticket.completedAt,
    });
  };

  return (
    <Modal
      title={t('ticketSettings.title')}
      onClose={onClose}
      width={560}
      footer={
        <>
          <div className="footer-left">
            <button className="ghost-button" onClick={onArchive} disabled={ticket.status === 'archived'}>
              <Icon name="archive" /> {t('common.archive')}
            </button>
            <button className="ghost-button danger-text" onClick={onDelete}>
              <Icon name="trash" /> {t('common.delete')}
            </button>
          </div>
          <button className="ghost-button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="primary-button" onClick={save}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>{t('newTicket.name')}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          <span>{t('newTicket.brief')}</span>
          <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>{t('field.type')}</span>
            <select value={type} onChange={(event) => setType(event.target.value as TicketType)}>
              {TICKET_TYPES.map((option) => (
                <option key={option} value={option}>
                  {t(`type.${option}` as const)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('field.status')}</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as TicketStatus)}>
              {TICKET_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {t(`status.${option}` as const)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>{t('field.width')}</span>
            <input type="number" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
          </label>
          <label className="field">
            <span>{t('field.height')}</span>
            <input type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} />
          </label>
          <label className="field">
            <span>{t('field.background')}</span>
            <select
              value={background}
              onChange={(event) => setBackground(event.target.value as BackgroundKind)}
            >
              {BACKGROUND_KINDS.map((option) => (
                <option key={option} value={option}>
                  {t(`background.${option}` as const)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {dimensionsChanged ? <p className="hint warn">{t('ticketSettings.dimsWarn')}</p> : null}
      </div>
    </Modal>
  );
}
