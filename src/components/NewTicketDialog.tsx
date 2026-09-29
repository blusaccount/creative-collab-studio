import { useState } from 'react';
import { BACKGROUND_LABEL, TICKET_TYPES } from '../types';
import type { BackgroundKind, TicketStatus, TicketType } from '../types';
import type { NewTicketInput } from '../state/useStudio';
import { Modal } from './Modal';

interface NewTicketDialogProps {
  defaultDimensions: { width: number; height: number };
  onClose: () => void;
  onSubmit: (input: NewTicketInput) => void;
}

const SIZE_PRESETS = [
  { label: '32', width: 32, height: 32 },
  { label: '64', width: 64, height: 64 },
  { label: '128', width: 128, height: 128 },
  { label: '256', width: 256, height: 256 },
  { label: '512', width: 512, height: 512 },
  { label: '1024', width: 1024, height: 1024 },
  { label: '2048', width: 2048, height: 2048 },
];

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
      title="New ticket"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" onClick={submit} disabled={!title.trim()}>
            Create ticket
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Title</span>
          <input
            autoFocus
            value={title}
            placeholder="e.g. Wooden crate texture"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="field">
          <span>Brief / description</span>
          <textarea
            rows={3}
            value={description}
            placeholder="What should this asset be? Style notes, palette, constraints..."
            onChange={(event) => setDescription(event.target.value)}
          />
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
            </select>
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Width (px)</span>
            <input
              type="number"
              min={1}
              max={4096}
              value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span>Height (px)</span>
            <input
              type="number"
              min={1}
              max={4096}
              value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
            />
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

        <div className="field">
          <span>Quick sizes</span>
          <div className="chip-row">
            {SIZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`chip ${width === preset.width && height === preset.height ? 'active' : ''}`}
                onClick={() => {
                  setWidth(preset.width);
                  setHeight(preset.height);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
