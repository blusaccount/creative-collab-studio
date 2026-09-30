import { useEffect, useRef } from 'react';
import type { BrushPreset, ShapePaint, TicketStatus, Tool, ToolSettings } from '../types';
import { TICKET_STATUSES } from '../types';
import { t, type TranslationKey } from '../i18n';
import { Icon, type IconName } from './Icon';

interface PaintRibbonProps {
  settings: ToolSettings;
  onSettingsChange: (patch: Partial<ToolSettings>) => void;
  recentColors: string[];
  onCommitColor: (color: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onExport: () => void;
  status: TicketStatus;
  onStatusChange: (status: TicketStatus) => void;
}

const TOOL_DEFS: { tool: Tool; icon: IconName; key: TranslationKey }[] = [
  { tool: 'pencil', icon: 'pencil', key: 'tool.pencil' },
  { tool: 'fill', icon: 'fill', key: 'tool.fill' },
  { tool: 'text', icon: 'text', key: 'tool.text' },
  { tool: 'eraser', icon: 'eraser', key: 'tool.eraser' },
  { tool: 'eyedropper', icon: 'eyedropper', key: 'tool.eyedropper' },
  { tool: 'magnifier', icon: 'magnifier', key: 'tool.magnifier' },
  { tool: 'pan', icon: 'pan', key: 'tool.pan' },
];

const SHAPE_DEFS: { tool: Tool; icon: IconName; key: TranslationKey }[] = [
  { tool: 'line', icon: 'shape-line', key: 'shape.line' },
  { tool: 'curve', icon: 'shape-curve', key: 'shape.curve' },
  { tool: 'rect', icon: 'shape-rect', key: 'shape.rect' },
  { tool: 'ellipse', icon: 'shape-ellipse', key: 'shape.ellipse' },
  { tool: 'triangle', icon: 'shape-triangle', key: 'shape.triangle' },
  { tool: 'roundRect', icon: 'shape-round-rect', key: 'shape.roundRect' },
  { tool: 'polygon', icon: 'shape-polygon', key: 'shape.polygon' },
];

const PRESETS: BrushPreset[] = ['hard', 'soft', 'textured'];
const PAINT_OPTIONS: ShapePaint[] = ['none', 'color1', 'color2'];
const QUICK_COLORS = [
  '#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8', '#3f48cc', '#a349a4',
  '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0', '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7',
];
const FONTS = ['Segoe UI', 'Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Comic Sans MS'];

function paintLabel(option: ShapePaint): string {
  if (option === 'none') return t('ribbon.paint.none');
  return option === 'color2' ? t('ribbon.paint.color2') : t('ribbon.paint.color1');
}

export function PaintRibbon({
  settings,
  onSettingsChange,
  recentColors,
  onCommitColor,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onExport,
  status,
  onStatusChange,
}: PaintRibbonProps) {
  const setColor1 = (color: string) => {
    onSettingsChange({ color });
    onCommitColor(color);
  };

  // The native color wheel fires `onChange` continuously while dragging: update
  // the brush live, but only commit a single recent color once the value settles.
  const pendingColor = useRef<string | null>(null);
  const commitTimer = useRef<number | null>(null);
  const flushColor = () => {
    if (commitTimer.current !== null) {
      window.clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    if (pendingColor.current) {
      onCommitColor(pendingColor.current);
      pendingColor.current = null;
    }
  };
  const pickColorLive = (color: string) => {
    onSettingsChange({ color });
    pendingColor.current = color;
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(flushColor, 650);
  };
  useEffect(() => flushColor, []);

  const swatches = Array.from(new Set([...recentColors, ...QUICK_COLORS])).slice(0, 20);
  const isText = settings.tool === 'text';

  return (
    <div className="paint-chrome">
      <div className="paint-ribbon">
        <section className="pr-group">
          <div className="pr-group-body icon-grid">
            {TOOL_DEFS.map((def) => (
              <button
                key={def.tool}
                className={`pr-tool ${settings.tool === def.tool ? 'active' : ''}`}
                title={t(def.key)}
                aria-label={t(def.key)}
                onClick={() => onSettingsChange({ tool: def.tool })}
              >
                <Icon name={def.icon} size={20} />
              </button>
            ))}
            <button className="pr-tool danger-text" title={t('ribbon.clear')} aria-label={t('ribbon.clear')} onClick={onClear}>
              <Icon name="trash" size={20} />
            </button>
          </div>
          <div className="pr-group-label">{t('ribbon.tools')}</div>
        </section>

        <section className="pr-group">
          <div className="pr-group-body">
            <div className="pr-stack">
              <div className="pr-row">
                <button
                  className={`pr-tool ${settings.tool === 'brush' ? 'active' : ''}`}
                  title={t('tool.brush')}
                  onClick={() => onSettingsChange({ tool: 'brush' })}
                >
                  <Icon name="brush" size={20} />
                </button>
                <label className="pr-select">
                  <span>{t('ribbon.brushStyle')}</span>
                  <select
                    value={settings.preset}
                    onChange={(event) => onSettingsChange({ preset: event.target.value as BrushPreset })}
                  >
                    {PRESETS.map((preset) => (
                      <option key={preset} value={preset}>
                        {t(`tool.preset.${preset}` as const)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {isText ? (
                <div className="pr-row">
                  <label className="pr-select">
                    <span>{t('ribbon.font')}</span>
                    <select value={settings.fontFamily} onChange={(event) => onSettingsChange({ fontFamily: event.target.value })}>
                      {FONTS.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="pr-select">
                    <span>{t('ribbon.fontSize')}</span>
                    <input
                      type="number"
                      min={8}
                      max={200}
                      value={settings.fontSize}
                      onChange={(event) => onSettingsChange({ fontSize: Number(event.target.value) || 8 })}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </div>
          <div className="pr-group-label">{t('tool.brush')}</div>
        </section>

        <section className="pr-group">
          <div className="pr-group-body">
            <div className="pr-stack">
              <div className="shape-grid">
                {SHAPE_DEFS.map((def) => (
                  <button
                    key={def.tool}
                    className={`pr-tool small ${settings.tool === def.tool ? 'active' : ''}`}
                    title={t(def.key)}
                    aria-label={t(def.key)}
                    onClick={() => onSettingsChange({ tool: def.tool })}
                  >
                    <Icon name={def.icon} size={17} />
                  </button>
                ))}
              </div>
              <div className="pr-row">
                <label className="pr-select">
                  <span>{t('ribbon.outline')}</span>
                  <select
                    value={settings.shapeOutline}
                    onChange={(event) => onSettingsChange({ shapeOutline: event.target.value as ShapePaint })}
                  >
                    {PAINT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {paintLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pr-select">
                  <span>{t('ribbon.fill')}</span>
                  <select
                    value={settings.shapeFill}
                    onChange={(event) => onSettingsChange({ shapeFill: event.target.value as ShapePaint })}
                  >
                    {PAINT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {paintLabel(option)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
          <div className="pr-group-label">{t('ribbon.shapes')}</div>
        </section>

        <section className="pr-group">
          <div className="pr-group-body">
            <div className="color-swatch-big">
              <label className="color-chip color1" title={`${t('ribbon.color1')}: ${settings.color}`}>
                <input
                  type="color"
                  aria-label={t('ribbon.color1')}
                  value={settings.color}
                  onChange={(event) => pickColorLive(event.target.value)}
                  onBlur={flushColor}
                />
              </label>
              <label className="color-chip color2" title={`${t('ribbon.color2')}: ${settings.color2}`}>
                <input
                  type="color"
                  aria-label={t('ribbon.color2')}
                  value={settings.color2}
                  onChange={(event) => onSettingsChange({ color2: event.target.value })}
                />
              </label>
            </div>
            <button
              className="pr-tool small"
              title={t('ribbon.swapColors')}
              aria-label={t('ribbon.swapColors')}
              onClick={() => onSettingsChange({ color: settings.color2, color2: settings.color })}
            >
              <Icon name="swap" size={16} />
            </button>
            <div className="palette-grid">
              {swatches.map((color) => (
                <button
                  key={color}
                  className="palette-dot"
                  style={{ background: color }}
                  title={`${color} · ${t('ribbon.color1')} / ${t('ribbon.color2')}`}
                  aria-label={color}
                  onClick={() => setColor1(color)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onSettingsChange({ color2: color });
                  }}
                />
              ))}
            </div>
          </div>
          <div className="pr-group-label">
            <Icon name="palette" size={12} /> {t('ribbon.colors')}
          </div>
        </section>

        <span className="pr-spacer" />

        <section className="pr-group">
          <div className="pr-group-body">
            <label className="pr-select vertical">
              <span>{t('ribbon.ticket')}</span>
              <select value={status} onChange={(event) => onStatusChange(event.target.value as TicketStatus)}>
                {TICKET_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {t(`status.${option}` as const)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="pr-group last">
          <div className="pr-group-body">
            <button className="paint-quick-button big" title={t('tool.undo')} aria-label={t('tool.undo')} onClick={onUndo} disabled={!canUndo}>
              <Icon name="undo" size={18} />
            </button>
            <button className="paint-quick-button big" title={t('tool.redo')} aria-label={t('tool.redo')} onClick={onRedo} disabled={!canRedo}>
              <Icon name="redo" size={18} />
            </button>
            <button className="primary-button paint-export" onClick={onExport}>
              <Icon name="download" size={17} /> {t('ribbon.export')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
