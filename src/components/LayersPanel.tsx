import { useRef, useSyncExternalStore } from 'react';
import type { DrawingEngine } from '../drawing/DrawingEngine';
import { Icon } from './Icon';

interface LayersPanelProps {
  engine: DrawingEngine;
  onChanged: () => void;
}

export function LayersPanel({ engine, onChanged }: LayersPanelProps) {
  useSyncExternalStore(engine.subscribe, engine.getVersion);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const targetLayerRef = useRef<string | null>(null);

  const layers = engine.getLayers();
  const activeId = engine.getActiveLayerId();

  const loadReference = (layerId: string) => {
    targetLayerRef.current = layerId;
    fileInputRef.current?.click();
  };

  const handleFile = (file: File | undefined) => {
    const layerId = targetLayerRef.current;
    if (!file || !layerId) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        void engine.setReferenceImage(layerId, reader.result).then(onChanged);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <section className="side-section layers-section">
      <div className="side-section-head">
        <h3>
          <Icon name="layers" size={14} /> Layers
        </h3>
        <div className="side-section-actions">
          <button className="icon-button" title="Add paint layer" onClick={() => { engine.addLayer('draw'); onChanged(); }}>
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>

      <div className="layer-list">
        {[...layers].reverse().map((layer) => {
          const index = layers.findIndex((item) => item.id === layer.id);
          return (
            <div
              key={layer.id}
              className={`layer-row ${activeId === layer.id ? 'active' : ''}`}
              onClick={() => engine.setActiveLayer(layer.id)}
            >
              <button
                className="icon-button tight"
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                onClick={(event) => {
                  event.stopPropagation();
                  engine.setLayerProps(layer.id, { visible: !layer.visible });
                }}
              >
                <Icon name={layer.visible ? 'eye' : 'eye-off'} size={14} />
              </button>
              <button
                className="icon-button tight"
                title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                onClick={(event) => {
                  event.stopPropagation();
                  engine.setLayerProps(layer.id, { locked: !layer.locked });
                }}
              >
                <Icon name={layer.locked ? 'lock' : 'unlock'} size={14} />
              </button>

              <div className="layer-info">
                <input
                  className="layer-name"
                  value={layer.name}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => engine.setLayerProps(layer.id, { name: event.target.value })}
                />
                <div className="layer-sub">
                  <span className={`layer-kind ${layer.kind}`}>{layer.kind}</span>
                  <input
                    className="layer-opacity"
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(layer.opacity * 100)}
                    title={`Opacity ${Math.round(layer.opacity * 100)}%`}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) =>
                      engine.setLayerProps(layer.id, { opacity: Number(event.target.value) / 100 })
                    }
                  />
                </div>
              </div>

              <div className="layer-actions">
                {layer.kind === 'reference' ? (
                  <button
                    className="icon-button tight"
                    title="Load reference image"
                    onClick={(event) => {
                      event.stopPropagation();
                      loadReference(layer.id);
                    }}
                  >
                    <Icon name="image" size={14} />
                  </button>
                ) : null}
                <button
                  className="icon-button tight"
                  title="Move up"
                  disabled={index === layers.length - 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    engine.moveLayer(layer.id, 1);
                  }}
                >
                  <Icon name="up" size={13} />
                </button>
                <button
                  className="icon-button tight"
                  title="Move down"
                  disabled={index === 0}
                  onClick={(event) => {
                    event.stopPropagation();
                    engine.moveLayer(layer.id, -1);
                  }}
                >
                  <Icon name="down" size={13} />
                </button>
                <button
                  className="icon-button tight danger-text"
                  title="Delete layer"
                  disabled={layers.length <= 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    engine.removeLayer(layer.id);
                    onChanged();
                  }}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="layer-footer">
        <button className="ghost-button small" onClick={() => { engine.addLayer('reference'); onChanged(); }}>
          <Icon name="image" size={14} /> Add reference layer
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(event) => {
          handleFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </section>
  );
}
