import type { LayerState } from '../types';
import { createId } from '../utils/id';

export interface DefaultLayerNames {
  paintName?: string;
  referenceName?: string;
}

export function createDefaultLayerStates(names?: DefaultLayerNames): LayerState[] {
  return [
    {
      id: createId('layer'),
      name: names?.referenceName ?? 'Reference',
      kind: 'reference',
      visible: true,
      opacity: 1,
      locked: false,
      dataUrl: '',
    },
    {
      id: createId('layer'),
      name: names?.paintName ?? 'Paint',
      kind: 'draw',
      visible: true,
      opacity: 1,
      locked: false,
      dataUrl: '',
    },
  ];
}
