import { useState } from 'react';
import { BACKGROUND_LABEL, TICKET_TYPES } from '../types';
import type { BackgroundKind, Ticket, TicketStatus, TicketType } from '../types';
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
      title="Ticket details"
      onClose={onClose}
      width={560}
      footer={
        <>
          <div className="footer-left">
            <button className="ghost-button" onClick={onArchive} disabled={ticket.status === 'archived'}>
              <Icon name="archive" /> Archive
            </button>
            <button className="ghost-button danger-text" onClick={onDelete}>
              <Icon name="trash" /> Delete
            </button>
          </div>
          <button className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          <span>Brief / description</span>
          <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Type</span>
            <select value={type} onChange={(event) => setType(event.target.value as TicketType)}>
              {TICKET_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as TicketStatus)}>
              <option value="backlog">Backlog</option>
              <option value="in-progress">In progress</option>
              <option value="review-ready">Review ready</option>
              <option value="complete">Complete</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Width (px)</span>
            <input type="number" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
          </label>
          <label className="field">
            <span>Height (px)</span>
            <input type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} />
          </label>
          <label className="field">
            <span>Canvas background</span>
            <select
              value={background}
              onChange={(event) => setBackground(event.target.value as BackgroundKind)}
            >
              {(Object.keys(BACKGROUND_LABEL) as BackgroundKind[]).map((option) => (
                <option key={option} value={option}>
                  {BACKGROUND_LABEL[option]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {dimensionsChanged ? (
          <p className="hint warn">
            Changing dimensions resizes the artboard. Existing art is scaled to fit and may shift.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
