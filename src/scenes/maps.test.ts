import { describe, expect, it } from 'vitest';
import { MAP_TYPES, mapColorSpace, mapDefaultBackground, mapSortIndex } from './maps';

describe('map helpers', () => {
  it('marks color maps as sRGB and data maps as linear', () => {
    expect(mapColorSpace('basecolor')).toBe('srgb');
    expect(mapColorSpace('emissive')).toBe('srgb');
    expect(mapColorSpace('normal')).toBe('linear');
    expect(mapColorSpace('roughness')).toBe('linear');
  });

  it('defaults color maps to opaque and others to transparent', () => {
    expect(mapDefaultBackground('basecolor')).toBe('white');
    expect(mapDefaultBackground('normal')).toBe('transparent');
  });

  it('sorts basecolor before other maps', () => {
    const sorted = [...MAP_TYPES].sort((a, b) => mapSortIndex(a) - mapSortIndex(b));
    expect(sorted[0]).toBe('basecolor');
    expect(mapSortIndex(undefined)).toBe(99);
  });
});
