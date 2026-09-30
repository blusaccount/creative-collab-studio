import type { EngineTarget, MapType } from '../types';
import type { TranslationKey } from '../i18n';

/** i18n key with a plain-language description of what a map is for. */
export function mapPurposeKey(map: MapType): TranslationKey {
  return `mapinfo.${map}` as TranslationKey;
}

/** i18n key describing the target engine's channel packing. */
export function packingHintKey(engine: EngineTarget): TranslationKey {
  return ({ unreal: 'packing.unreal', unity: 'packing.unity', gltf: 'packing.gltf' } as const)[engine];
}

export const MAP_TYPES: MapType[] = [
  'basecolor',
  'normal',
  'roughness',
  'metallic',
  'ao',
  'emissive',
  'opacity',
  'height',
  'packed',
  'other',
];

export const ENGINE_TARGETS: EngineTarget[] = ['unreal', 'unity', 'gltf'];

/** sRGB for colour maps, linear (non-colour) for data maps. */
export function mapColorSpace(map: MapType): 'srgb' | 'linear' {
  return map === 'basecolor' || map === 'emissive' ? 'srgb' : 'linear';
}

/** BaseColor/emissive usually opaque; everything else benefits from transparency. */
export function mapDefaultBackground(map: MapType): 'white' | 'transparent' {
  return map === 'basecolor' || map === 'emissive' ? 'white' : 'transparent';
}

const MAP_ORDER: Record<MapType, number> = {
  basecolor: 0,
  normal: 1,
  roughness: 2,
  metallic: 3,
  ao: 4,
  packed: 5,
  height: 6,
  emissive: 7,
  opacity: 8,
  other: 9,
};

export function mapSortIndex(map: MapType | undefined): number {
  return map ? MAP_ORDER[map] : 99;
}
