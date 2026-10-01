import type { LayerState } from '../types';

/** Cheap, stable hash of a draw layer stack (used to detect real content changes). */
export function hashLayers(layers: LayerState[]): string {
  let hash = 0;
  const push = (value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
    }
  };
  for (const layer of layers) {
    push(layer.id);
    push(layer.kind);
    push(layer.name);
    push(String(layer.visible));
    push(String(layer.opacity));
    push(layer.dataUrl);
  }
  return (hash >>> 0).toString(36);
}
