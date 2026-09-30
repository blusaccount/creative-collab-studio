import { useState } from 'react';
import type { NewProjectInput } from '../state/useStudio';
import { t } from '../i18n';
import { Modal } from './Modal';

interface NewProjectDialogProps {
  onClose: () => void;
  onSubmit: (input: NewProjectInput) => void;
}

export function NewProjectDialog({ onClose, onSubmit }: NewProjectDialogProps) {
  const [name, setName] = useState('');
  const [assetOutputFolder, setAssetOutputFolder] = useState('creative-collab-output');
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);

  return (
    <Modal
      title={t('newProject.title')}
      onClose={onClose}
      width={480}
      footer={
        <>
          <button className="ghost-button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="primary-button"
            disabled={!name.trim()}
            onClick={() =>
              onSubmit({
                name,
                assetOutputFolder,
                defaultDimensions: { width, height },
              })
            }
          >
            {t('newProject.create')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>{t('newProject.name')}</span>
          <input
            autoFocus
            value={name}
            placeholder={t('newProject.namePlaceholder')}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          <span>{t('newProject.outputFolder')}</span>
          <input value={assetOutputFolder} onChange={(event) => setAssetOutputFolder(event.target.value)} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>{t('field.defaultWidth')}</span>
            <input type="number" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
          </label>
          <label className="field">
            <span>{t('field.defaultHeight')}</span>
            <input type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} />
          </label>
        </div>
      </div>
    </Modal>
  );
}
