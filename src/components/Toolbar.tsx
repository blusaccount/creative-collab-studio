import type { BrushSettings, BrushPreset, TicketStatus, Tool, ViewState } from '../types';
import { STATUS_LABEL } from '../types';
import { Icon, type IconName } from './Icon';

interface ToolbarProps {
  brush: BrushSettings;
  onBrushChange: (patch: Partial<BrushSettings>) => void;
  onCommitColor: (color: string) => void;
  recentColors: string[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onExport: () => void;
  view: ViewState;
  onViewChange: (patch: Partial<ViewState>) => void;
  onFit: () => void;
  status: TicketStatus;
  onStatusChange: (status: TicketStatus) => void;
}

const TOOLS: { tool: Tool; icon: IconName; label: string; shortcut: string }[] = [
  { tool: 'brush', icon: 'brush', label: 'Brush', shortcut: 'B' },
  { tool: 'eraser', icon: 'eraser', label: 'Eraser', shortcut: 'E' },
  { tool: 'fill', icon: 'fill', label: 'Fill', shortcut: 'G' },
  { tool: 'eyedropper', icon: 'eyedropper', label: 'Eyedropper', shortcut: 'I' },
  { tool: 'pan', icon: 'pan', label: 'Pan', shortcut: 'H' },
];

const PRESETS: { preset: BrushPreset; label: string }[] = [
  { preset: 'hard', label: 'Hard' },
  { preset: 'soft', label: 'Soft' },
  { preset: 'textured', label: 'Textured' },
];

const QUICK_COLORS = ['#111827', '#ffffff', '#ef4444', '#f97316', '#fbbf24', '#34d399', '#38bdf8', '#a78bfa'];

export function Toolbar({
  brush,
  onBrushChange,
  onCommitColor,
  recentColors,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onExport,
  view,
  onViewChange,
  onFit,
  status,
  onStatusChange,
}: ToolbarProps) {
  const setColor = (color: string) => {
    onBrushChange({ color });
    onCommitColor(color);
  };
  const swatches = Array.from(new Set([...recentColors, ...QUICK_COLORS])).slice(0, 14);

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <div className="tool-cluster">
          {TOOLS.map((item) => (
            <button
              key={item.tool}
              className={`tool-button ${brush.tool === item.tool ? 'active' : ''}`}
              title={`${item.label} (${item.shortcut})`}
              onClick={() => onBrushChange({ tool: item.tool })}
            >
              <Icon name={item.icon} size={17} />
            </button>
          ))}
        </div>

        <div className="tool-cluster">
          <button className="tool-button" title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
            <Icon name="undo" size={17} />
          </button>
          <button className="tool-button" title="Redo (Ctrl+Shift+Z)" onClick={onRedo} disabled={!canRedo}>
            <Icon name="redo" size={17} />
          </button>
        </div>

        <div className="tool-cluster color-cluster">
          <label className="color-input" title="Brush color">
            <input
              type="color"
              value={brush.color}
              onChange={(event) => setColor(event.target.value)}
            />
          </label>
          <div className="swatch-row">
            {swatches.map((color) => (
              <button
                key={color}
                className={`swatch ${brush.color.toLowerCase() === color.toLowerCase() ? 'active' : ''}`}
                style={{ background: color }}
                title={color}
                onClick={() => setColor(color)}
              />
            ))}
          </div>
        </div>

        <div className="tool-cluster spacer" />

        <div className="tool-cluster">
          <button
            className={`tool-button ${view.showGrid ? 'active' : ''}`}
            title="Toggle pixel grid"
            onClick={() => onViewChange({ showGrid: !view.showGrid })}
          >
            <Icon name="grid" size={17} />
          </button>
          <select
            className="mini-select"
            value={view.gridSize}
            title="Grid size"
            onChange={(event) => onViewChange({ gridSize: Number(event.target.value), showGrid: true })}
          >
            {[4, 8, 16, 32, 64].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <button
            className={`tool-button ${view.showReferences ? 'active' : ''}`}
            title="Toggle reference layers"
            onClick={() => onViewChange({ showReferences: !view.showReferences })}
          >
            <Icon name="image" size={17} />
          </button>
        </div>

        <div className="tool-cluster zoom-cluster">
          <button className="tool-button" title="Zoom out" onClick={() => onViewChange({ zoom: Math.max(0.05, view.zoom / 1.2) })}>
            <Icon name="zoom-out" size={17} />
          </button>
          <span className="zoom-label">{Math.round(view.zoom * 100)}%</span>
          <button className="tool-button" title="Zoom in" onClick={() => onViewChange({ zoom: Math.min(8, view.zoom * 1.2) })}>
            <Icon name="zoom-in" size={17} />
          </button>
          <button className="tool-button" title="Fit to view" onClick={onFit}>
            <Icon name="fit" size={17} />
          </button>
        </div>

        <div className="tool-cluster">
          <button className="ghost-button" onClick={onClear} title="Clear the active layer">
            Clear
          </button>
          <button className="primary-button" onClick={onExport} title="Export PNG">
            <Icon name="download" size={15} /> Export
          </button>
        </div>
      </div>

      <div className="toolbar-row secondary">
        <div className="tool-cluster preset-cluster">
          <span className="cluster-label">Brush</span>
          {PRESETS.map((item) => (
            <button
              key={item.preset}
              className={`chip ${brush.preset === item.preset ? 'active' : ''}`}
              onClick={() => onBrushChange({ preset: item.preset })}
              disabled={brush.tool !== 'brush' && brush.tool !== 'eraser'}
            >
              {item.label}
            </button>
          ))}
        </div>

        <label className="slider-field">
          <span>Size</span>
          <input
            type="range"
            min={1}
            max={128}
            value={brush.size}
            onChange={(event) => onBrushChange({ size: Number(event.target.value) })}
          />
          <span className="slider-value">{brush.size}px</span>
        </label>

        <label className="slider-field">
          <span>Opacity</span>
          <input
            type="range"
            min={5}
            max={100}
            value={Math.round(brush.opacity * 100)}
            onChange={(event) => onBrushChange({ opacity: Number(event.target.value) / 100 })}
          />
          <span className="slider-value">{Math.round(brush.opacity * 100)}%</span>
        </label>

        <div className="tool-cluster spacer" />

        <label className="status-select">
          <span>Status</span>
          <select value={status} onChange={(event) => onStatusChange(event.target.value as TicketStatus)}>
            {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((option) => (
              <option key={option} value={option}>
                {STATUS_LABEL[option]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
