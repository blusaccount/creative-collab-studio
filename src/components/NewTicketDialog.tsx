import { useState } from 'react';
import { BACKGROUND_KINDS, TICKET_TYPES } from '../types';
import type { BackgroundKind, TicketStatus, TicketType } from '../types';
import type { NewTicketInput } from '../state/useStudio';
import { t } from '../i18n';
import { Modal } from './Modal';

interface NewTicketDialogProps {
  defaultDimensions: { width: number; height: number };
  onClose: () => void;
  onSubmit: (input: NewTicketInput) => void;
}

const SIZE_PRESETS = [32, 64, 128, 256, 512, 1024, 2048];

const STATUS_CHOICES: TicketStatus[] = ['backlog', 'in-progress', 'review-ready', 'complete'];

export function NewTicketDialog({ defaultDimensions, onClose, onSubmit }: NewTicketDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TicketType>('texture');
  const [status, setStatus] = useState<TicketStatus>('backlog');
  const [width, setWidth] = useState(defaultDimensions.width);
  const [height, setHeight] = useState(defaultDimensions.height);
  const [background, setBackground] = useState<BackgroundKind>('transparent');

  const submit = () => {
    onSubmit({
      title,
      description,
      type,
      status,
      dimensions: {
        width: Math.max(1, Math.min(4096, Math.round(width) || 1)),
        height: Math.max(1, Math.min(4096, Math.round(height) || 1)),
      },
      background,
    });
  };

  return (
    <Modal
      title={t('newTicket.title')}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="ghost-button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="primary-button" onClick={submit} disabled={!title.trim()}>
            {t('newTicket.create')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>{t('newTicket.name')}</span>
          <input
            autoFocus
            value={title}
            placeholder={t('newTicket.namePlaceholder')}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="field">
          <span>{t('newTicket.brief')}</span>
          <textarea
            rows={3}
            value={description}
            placeholder={t('newTicket.briefPlaceholder')}
            onChange={(event) => setDescription(event.target.value)}
          />
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
              {STATUS_CHOICES.map((option) => (
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
            <input
              type="number"
              min={1}
              max={4096}
              value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span>{t('field.height')}</span>
            <input
              type="number"
              min={1}
              max={4096}
              value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
            />
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

        <div className="field">
          <span>{t('newTicket.quickSizes')}</span>
          <div className="chip-row">
            {SIZE_PRESETS.map((size) => (
              <button
                key={size}
                type="button"
                className={`chip ${width === size && height === size ? 'active' : ''}`}
                onClick={() => {
                  setWidth(size);
                  setHeight(size);
                }}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
