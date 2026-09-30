import { describe, expect, it } from 'vitest';
import type { SceneBlueprint } from '../types';
import { validateBlueprint, validateBlueprintReport } from './build';

function asset(title: string) {
  return {
    title,
    type: 'prop',
    dimensions: { width: 64, height: 64 },
    background: 'transparent',
    brief: '',
    layout: { x: 0, y: 0, width: 64, height: 64, layer: 0 },
  };
}

describe('validateBlueprintReport', () => {
  it('rejects non-objects and missing assets/maps', () => {
    expect(validateBlueprintReport(null).blueprint).toBeNull();
    expect(validateBlueprintReport({}).report.errors.length).toBeGreaterThan(0);
    expect(validateBlueprintReport({ assets: [], maps: [] }).report.errors.length).toBeGreaterThan(0);
    expect(validateBlueprint(null)).toBeNull();
  });

  it('accepts a minimal valid scene blueprint', () => {
    const { blueprint, report } = validateBlueprintReport({
      name: 'Test Scene',
      description: '',
      artDirection: '',
      assets: [asset('A')],
    });
    expect(report.errors).toHaveLength(0);
    expect(blueprint?.assets).toHaveLength(1);
    expect(blueprint?.kind).toBe('scene');
  });

  it('warns on unknown asset type and falls back to "prop"', () => {
    const { blueprint, report } = validateBlueprintReport({
      name: 'Test',
      assets: [{ ...asset('A'), type: 'weird' }],
    });
    expect(report.warnings.some((w) => w.includes('type'))).toBe(true);
    expect(blueprint?.assets?.[0].type).toBe('prop');
  });

  it('rejects more than 200 entries', () => {
    const assets = Array.from({ length: 201 }, (_, i) => asset(`A${i}`));
    const { blueprint, report } = validateBlueprintReport({ name: 'Big', assets });
    expect(blueprint).toBeNull();
    expect(report.errors.some((e) => e.includes('200'))).toBe(true);
  });

  it('requires a uvLayout for model part maps', () => {
    const input = {
      kind: 'model' as const,
      name: 'Model',
      maps: [{ map: 'basecolor' as const, part: 'HEAD', brief: '' }],
    };
    const { report } = validateBlueprintReport(input);
    expect(report.errors.some((e) => e.includes('uvLayout'))).toBe(true);
    // Blocking errors make the convenience wrapper refuse the blueprint.
    expect(validateBlueprint(input)).toBeNull();
  });

  it('accepts a model blueprint with matching part and uvLayout', () => {
    const blueprintInput: SceneBlueprint = {
      kind: 'model',
      name: 'Model',
      description: '',
      artDirection: '',
      uvLayout: [{ name: 'HEAD', x: 0, y: 0, w: 0.5, h: 0.5 }],
      maps: [{ map: 'basecolor', part: 'HEAD', brief: '' }],
    };
    const { blueprint, report } = validateBlueprintReport(blueprintInput);
    expect(report.errors).toHaveLength(0);
    expect(blueprint?.maps).toHaveLength(1);
  });
});
