import type { SceneBlueprint } from '../src/types';
import { validateBlueprintReport } from '../src/scenes/build';

const ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;

/** Turns any string into a safe, deterministic id fragment. */
export function toIdFragment(value: string, fallback: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

/** Keeps a valid id as-is; otherwise derives a safe one from it. */
function safeId(value: string | undefined, derived: string): string {
  if (value && ID_PATTERN.test(value)) return value;
  if (value) return toIdFragment(value, derived);
  return derived;
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Map<string, number>();
  return ids.map((id) => {
    const count = (seen.get(id) ?? 0) + 1;
    seen.set(id, count);
    return count === 1 ? id : `${id}-${count}`;
  });
}

/**
 * Gives the blueprint and every asset/map a stable id. The studio matches
 * tickets by these ids on re-import, so a revised plan keeps the artwork that
 * was already painted, and the bridge tracks delivery per id. Ids are derived
 * deterministically, so an AI that omits them still gets stable ids as long as
 * titles/parts stay the same.
 */
export function assignStableIds(blueprint: SceneBlueprint): SceneBlueprint {
  const kind = blueprint.kind ?? 'scene';
  const id = safeId(blueprint.id, `${kind}-${toIdFragment(blueprint.name, 'production')}`);

  const assetIds = uniqueIds(
    (blueprint.assets ?? []).map((asset) =>
      safeId(asset.id, `asset-${toIdFragment(asset.title, 'untitled')}`),
    ),
  );
  const mapIds = uniqueIds(
    (blueprint.maps ?? []).map((map) =>
      safeId(map.id, `map-${map.part ? `${toIdFragment(map.part, 'part')}-` : ''}${map.map}`),
    ),
  );

  return {
    ...blueprint,
    id,
    action: 'upsert',
    assets: (blueprint.assets ?? []).map((asset, index) => ({ ...asset, id: assetIds[index] })),
    maps: (blueprint.maps ?? []).map((map, index) => ({ ...map, id: mapIds[index] })),
  };
}

export interface PreparedBlueprint {
  blueprint: SceneBlueprint | null;
  errors: string[];
  warnings: string[];
}

/** Validates an AI-submitted blueprint (same rules as the studio's import) and assigns stable ids. */
export function prepareBlueprint(value: unknown): PreparedBlueprint {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      return { blueprint: null, errors: [`Blueprint is not valid JSON: ${(error as Error).message}`], warnings: [] };
    }
  }
  const { blueprint, report } = validateBlueprintReport(parsed);
  if (!blueprint || report.errors.length > 0) {
    return { blueprint: null, errors: report.errors, warnings: report.warnings };
  }
  return { blueprint: assignStableIds(blueprint), errors: [], warnings: report.warnings };
}

export function isSafeId(value: string): boolean {
  return ID_PATTERN.test(value);
}
