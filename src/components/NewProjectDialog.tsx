import { useState } from 'react';
import type { NewProjectInput } from '../state/useStudio';
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
      title="New project"
      onClose={onClose}
      width={480}
      footer={
        <>
          <button className="ghost-button" onClick={onClose}>
            Cancel
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
            Create project
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Project name</span>
          <input
            autoFocus
            value={name}
            placeholder="e.g. Neon Arcade"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Asset output folder</span>
          <input value={assetOutputFolder} onChange={(event) => setAssetOutputFolder(event.target.value)} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Default width (px)</span>
            <input type="number" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
          </label>
          <label className="field">
            <span>Default height (px)</span>
            <input type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} />
          </label>
        </div>
      </div>
    </Modal>
  );
}
