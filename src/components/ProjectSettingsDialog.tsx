import { useState } from 'react';
import type { Project } from '../types';
import { Modal } from './Modal';
import { Icon } from './Icon';

interface ProjectSettingsDialogProps {
  project: Project;
  onClose: () => void;
  onSave: (patch: Partial<Project>) => void;
  onDelete: () => void;
}

export function ProjectSettingsDialog({ project, onClose, onSave, onDelete }: ProjectSettingsDialogProps) {
  const [name, setName] = useState(project.name);
  const [assetOutputFolder, setAssetOutputFolder] = useState(project.assetOutputFolder);
  const [width, setWidth] = useState(project.defaultDimensions.width);
  const [height, setHeight] = useState(project.defaultDimensions.height);

  const save = () => {
    onSave({
      name: name.trim() || project.name,
      assetOutputFolder: assetOutputFolder.trim() || project.assetOutputFolder,
      defaultDimensions: {
        width: Math.max(1, Math.min(4096, Math.round(width) || 1)),
        height: Math.max(1, Math.min(4096, Math.round(height) || 1)),
      },
    });
  };

  return (
    <Modal
      title="Project settings"
      onClose={onClose}
      width={520}
      footer={
        <>
          <div className="footer-left">
            <button className="ghost-button danger-text" onClick={onDelete}>
              <Icon name="trash" /> Delete project
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
          <span>Project name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>Asset output folder name</span>
          <input
            value={assetOutputFolder}
            onChange={(event) => setAssetOutputFolder(event.target.value)}
          />
          <small>Used as the root folder when batch-exporting assets to disk.</small>
        </label>
        <div className="field-row">
          <label className="field">
            <span>Default width (px)</span>
            <input type="number" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
          </label>
          <label className="field">
            <span>Default height (px)</span>
            <input
              type="number"
              value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}
