import type { Project } from '../types';

export function createSeedProject(now = Date.now()): Project {
  return {
    id: 'project-default',
    name: 'Mein erstes Projekt',
    assetOutputFolder: 'creative-collab-output',
    defaultDimensions: { width: 512, height: 512 },
    createdAt: now,
    updatedAt: now,
  };
}
