import { describe, expect, it } from 'vitest';
import { buildSceneFromBlueprint, validateBlueprintReport } from '../scenes/build';
import { DEMO_DUNGEON_STATE, DEMO_START_ASSET } from './demo';
import { DUNGEON_ENTRANCE_BLUEPRINT } from './dungeonScene';
import { getPlayerKnightBlueprint } from './modelDemo';
import demoBlueprint from '../../presentation/demo-blueprint.json';

describe('demo content', () => {
  it('has a demo state for every dungeon asset and nothing else', () => {
    const ids = (DUNGEON_ENTRANCE_BLUEPRINT.assets ?? []).map((asset) => asset.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(DEMO_DUNGEON_STATE).sort()).toEqual([...ids].sort());
    expect(DEMO_DUNGEON_STATE[DEMO_START_ASSET]?.status).toBe('in-progress');
  });

  it('builds the knight as one ticket per body part', () => {
    const blueprint = getPlayerKnightBlueprint();
    const { tickets } = buildSceneFromBlueprint(blueprint, 'project-1', 0);
    expect(tickets.map((ticket) => ticket.modelPart?.name)).toEqual(blueprint.uvLayout?.map((part) => part.name));
    expect(tickets.every((ticket) => ticket.acceptanceCriteria?.length)).toBe(true);
  });

  it('ships a paste-ready blueprint that validates without errors', () => {
    const { blueprint, report } = validateBlueprintReport(demoBlueprint);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(blueprint?.assets).toHaveLength(3);
  });
});
