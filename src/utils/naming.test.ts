import { describe, expect, it } from 'vitest';
import type { Project, StudioSettings, Ticket } from '../types';
import { buildAssetFilename, buildAssetSubfolders, slugify } from './naming';

const project: Project = {
  id: 'p1',
  name: 'My Game',
  assetOutputFolder: 'Output Assets',
  defaultDimensions: { width: 512, height: 512 },
  createdAt: 0,
  updatedAt: 0,
};

const settings: StudioSettings = {
  recentColors: [],
  theme: 'light',
  language: 'de',
  fileNamingTemplate: '{project}-{title}-{version}',
  useVersionSuffix: true,
  trimOnExport: false,
};

function ticket(patch: Partial<Ticket> = {}): Ticket {
  return {
    id: 't1',
    projectId: 'p1',
    title: 'Hero Sword!',
    description: '',
    type: 'prop',
    status: 'complete',
    dimensions: { width: 512, height: 512 },
    order: 0,
    notes: [],
    layers: [],
    background: 'transparent',
    version: 3,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

describe('slugify', () => {
  it('produces url-safe slugs and never empty', () => {
    expect(slugify('Hero Sword!')).toBe('hero-sword');
    expect(slugify('   ')).toBe('asset');
  });
});

describe('buildAssetFilename', () => {
  it('applies the naming template and version suffix', () => {
    expect(buildAssetFilename(ticket(), project, settings)).toBe('my-game-hero-sword-v3-v3.png');
  });

  it('omits the version suffix when disabled', () => {
    expect(buildAssetFilename(ticket(), project, { ...settings, useVersionSuffix: false })).toBe(
      'my-game-hero-sword-v3.png',
    );
  });
});

describe('buildAssetSubfolders', () => {
  it('uses project folder, type and year-month', () => {
    const folders = buildAssetSubfolders(ticket({ completedAt: Date.UTC(2026, 0, 5) }), project);
    expect(folders[0]).toBe('output-assets');
    expect(folders[1]).toBe('prop');
    expect(folders[2]).toMatch(/^2026-0[01]$/);
  });
});
