import type { LayerState } from '../types';
import { createId } from '../utils/id';

export function createDefaultLayerStates(): LayerState[] {
  return [
    {
      id: createId('layer'),
      name: 'Reference',
      kind: 'reference',
      visible: true,
      opacity: 1,
      locked: false,
      dataUrl: '',
    },
    {
      id: createId('layer'),
      name: 'Paint',
      kind: 'draw',
      visible: true,
      opacity: 1,
      locked: false,
      dataUrl: '',
    },
  ];
}
