import { describe, expect, it } from 'vitest';
import type { LayerState } from '../types';
import { hashLayers } from './hash';

function layer(patch: Partial<LayerState> = {}): LayerState {
  return {
    id: 'l1',
    name: 'Paint',
    kind: 'draw',
    visible: true,
    opacity: 1,
    locked: false,
    dataUrl: '',
    ...patch,
  };
}

describe('hashLayers', () => {
  it('is stable for identical stacks', () => {
    expect(hashLayers([layer(), layer({ id: 'l2' })])).toBe(hashLayers([layer(), layer({ id: 'l2' })]));
  });

  it('changes when artwork changes', () => {
    expect(hashLayers([layer({ dataUrl: 'a' })])).not.toBe(hashLayers([layer({ dataUrl: 'b' })]));
  });

  it('changes when layer properties change', () => {
    expect(hashLayers([layer({ visible: true })])).not.toBe(hashLayers([layer({ visible: false })]));
    expect(hashLayers([layer({ opacity: 1 })])).not.toBe(hashLayers([layer({ opacity: 0.5 })]));
  });
});
