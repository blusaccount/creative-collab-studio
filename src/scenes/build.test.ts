import { describe, expect, it } from 'vitest';
import type { SceneBlueprint } from '../types';
import { buildSceneFromBlueprint, validateBlueprint, validateBlueprintReport } from './build';

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

describe('buildSceneFromBlueprint ids', () => {
  const blueprint = {
    id: 'shared-plan',
    name: 'Plan',
    description: '',
    artDirection: '',
    assets: [
      {
        id: 'torch',
        title: 'Torch',
        type: 'prop' as const,
        priority: 'high' as const,
        acceptanceCriteria: ['Transparent background'],
        dimensions: { width: 64, height: 64 },
        background: 'transparent' as const,
        brief: '',
        layout: { x: 0, y: 0, width: 64, height: 64, layer: 0 },
      },
    ],
  };

  it('keeps AI ids out of the database keys so two imports never collide', () => {
    const first = buildSceneFromBlueprint(blueprint, 'project-a', 0);
    const second = buildSceneFromBlueprint(blueprint, 'project-b', 0);
    expect(first.scene.id).not.toBe(second.scene.id);
    expect(first.tickets[0].id).not.toBe(second.tickets[0].id);
    expect(first.scene.blueprintId).toBe('shared-plan');
    expect(first.tickets[0].blueprintAssetId).toBe('torch');
  });

  it('carries priority and acceptance criteria onto the ticket', () => {
    const [ticket] = buildSceneFromBlueprint(blueprint, 'project-a', 0).tickets;
    expect(ticket.priority).toBe('high');
    expect(ticket.acceptanceCriteria).toEqual(['Transparent background']);
  });
});
