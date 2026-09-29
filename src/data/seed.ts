import type { Project, Ticket, TicketStatus, TicketType } from '../types';

interface SeedTicket {
  title: string;
  type: TicketType;
  status: TicketStatus;
  dimensions: { width: number; height: number };
  description: string;
}

const SEED_TICKETS: SeedTicket[] = [
  {
    title: 'GameCube room poster',
    type: 'texture',
    status: 'backlog',
    dimensions: { width: 512, height: 512 },
    description:
      'Hand-drawn poster for a retro room wall. Slightly surreal, nostalgic, early 2000s magazine art influence. Warm colors, slightly warped edges, soft paper texture. Export with transparency so the wall shows through torn corners.',
  },
  {
    title: 'Controller body texture',
    type: 'prop',
    status: 'in-progress',
    dimensions: { width: 1024, height: 1024 },
    description:
      'Paint a gamepad body with subtle wear, soft plastic shading, and nostalgic button detail. Keep it hand-painted and not too clean. Leave the shell seam as a soft dark line.',
  },
  {
    title: 'CRT glow overlay',
    type: 'effect',
    status: 'review-ready',
    dimensions: { width: 1280, height: 720 },
    description:
      'Design a slightly surreal CRT glow overlay for the booting TV screen. Use soft blues and warm whites with gentle scanline noise. Must be exported as a transparent PNG layer.',
  },
];

export function createSeedProject(now = Date.now()): Project {
  return {
    id: 'project-default',
    name: 'My First Project',
    assetOutputFolder: 'creative-collab-output',
    defaultDimensions: { width: 512, height: 512 },
    createdAt: now,
    updatedAt: now,
  };
}

export function createSeedTickets(projectId: string, now = Date.now()): Ticket[] {
  return SEED_TICKETS.map((seed, index) => ({
    id: `ticket-seed-${index + 1}`,
    projectId,
    title: seed.title,
    description: seed.description,
    type: seed.type,
    status: seed.status,
    dimensions: seed.dimensions,
    order: index,
    notes: [],
    layers: [],
    background: 'white' as const,
    version: 1,
    createdAt: now + index,
    updatedAt: now + index,
  }));
}
