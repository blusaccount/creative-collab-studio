import { describe, expect, it } from 'vitest';
import { hexToRgb, isLightColor, normalizeHex, rgbToHex } from './color';

describe('color utils', () => {
  it('expands 3-digit hex and normalizes case', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('f00')).toBe('#ff0000');
  });

  it('falls back to black for invalid input', () => {
    expect(normalizeHex('nope')).toBe('#000000');
    expect(normalizeHex('#12345')).toBe('#000000');
  });

  it('converts hex to rgb and back', () => {
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(rgbToHex(255, 128, 0)).toBe('#ff8000');
    expect(rgbToHex(300, -5, 12.4)).toBe('#ff000c');
  });

  it('detects light colors', () => {
    expect(isLightColor('#ffffff')).toBe(true);
    expect(isLightColor('#000000')).toBe(false);
  });
});
