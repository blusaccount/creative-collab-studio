import type { MapType, MeshSpec, SceneBlueprint, UvIsland } from '../types';

export const PLAYER_KNIGHT_NAME = 'Player – Ritter';

/** UV islands (normalised 0–1) shared by the template image and the preview mesh. */
export const PLAYER_KNIGHT_UV: UvIsland[] = [
  { name: 'HEAD', x: 0.06, y: 0.06, w: 0.36, h: 0.28 },
  { name: 'TORSO', x: 0.5, y: 0.06, w: 0.44, h: 0.4 },
  { name: 'ARM L', x: 0.06, y: 0.4, w: 0.18, h: 0.34 },
  { name: 'ARM R', x: 0.28, y: 0.4, w: 0.18, h: 0.34 },
  { name: 'LEG L', x: 0.52, y: 0.52, w: 0.2, h: 0.42 },
  { name: 'LEG R', x: 0.76, y: 0.52, w: 0.2, h: 0.42 },
  { name: 'CAPE', x: 0.06, y: 0.79, w: 0.4, h: 0.15 },
];

/** A hand-authored, better-proportioned knight mesh (sphere head, cylinder limbs). */
export function buildKnightMesh(): MeshSpec {
  const uv = (name: string): [number, number, number, number] => {
    const island = PLAYER_KNIGHT_UV.find((entry) => entry.name === name)!;
    return [island.x, island.y, island.w, island.h];
  };
  return {
    parts: [
      { name: 'HEAD', shape: 'sphere', size: [0.6, 0.62, 0.6], position: [0, 1.5, 0], uv: uv('HEAD') },
      { name: 'TORSO', shape: 'box', size: [0.86, 1.0, 0.5], position: [0, 0.72, 0], uv: uv('TORSO') },
      { name: 'ARM L', shape: 'cylinder', size: [0.26, 0.96, 0.26], position: [-0.64, 0.6, 0], uv: uv('ARM L') },
      { name: 'ARM R', shape: 'cylinder', size: [0.26, 0.96, 0.26], position: [0.64, 0.6, 0], uv: uv('ARM R') },
      { name: 'LEG L', shape: 'cylinder', size: [0.34, 1.02, 0.34], position: [-0.23, -0.52, 0], uv: uv('LEG L') },
      { name: 'LEG R', shape: 'cylinder', size: [0.34, 1.02, 0.34], position: [0.23, -0.52, 0], uv: uv('LEG R') },
      { name: 'CAPE', shape: 'box', size: [1.05, 1.5, 0.06], position: [0, 0.6, -0.35], uv: uv('CAPE') },
    ],
  };
}

/** Draws a simple, readable UV layout (grid + wireframe islands + labels + "up" bars). */
export function createUvTemplate(layout: UvIsland[]): string {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, size, size);
  const cells = 8;
  const cell = size / cells;
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#161922' : '#1d2130';
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  for (const island of layout) {
    const x = island.x * size;
    const y = island.y * size;
    const w = island.w * size;
    const h = island.h * size;
    ctx.fillStyle = 'rgba(76, 194, 255, 0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(76, 194, 255, 0.6)';
    ctx.fillRect(x, y, w, 5); // "up" bar = top edge
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 26px "Segoe UI", Arial, sans-serif';
  for (const island of layout) {
    ctx.fillText(island.name, island.x * size + 16, island.y * size + 34);
  }
  ctx.strokeStyle = '#4cc2ff';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);
  return canvas.toDataURL('image/png');
}

// ---------------------------------------------------------------------------
// Paint recipe — a painterly rendition of the knight, coherent across maps.
// ---------------------------------------------------------------------------

const COLORS = {
  steel: '#9aa5b1',
  steelHi: '#e8eef4',
  steelSh: '#55606d',
  steelWorn: '#6e7a87',
  leather: '#7a5230',
  leatherHi: '#a87a4a',
  leatherSh: '#3a2815',
  cloth: '#4a5568',
  clothHi: '#6b7a8f',
  clothSh: '#2b3340',
  cape: '#2c3e66',
  capeHi: '#4a5d8f',
  gold: '#c9a24b',
  goldHi: '#f0d98a',
  rune: '#6fd7ff',
  runeCore: '#d9f6ff',
};

type Role = 'helm' | 'torso' | 'arm' | 'leg' | 'cape';

function roleFor(name: string): Role {
  if (name === 'HEAD') return 'helm';
  if (name === 'TORSO') return 'torso';
  if (name.startsWith('ARM')) return 'arm';
  if (name.startsWith('LEG')) return 'leg';
  return 'cape';
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Deterministic per-island details, reused across maps for coherence. */
interface Details {
  folds: number[];
  rivets: { x: number; y: number }[];
  scratches: { x1: number; y1: number; x2: number; y2: number }[];
}

function detailsFor(role: Role, seed: number): Details {
  const rng = mulberry32(seed);
  const folds: number[] = [];
  const foldCount = role === 'cape' ? 6 : 4;
  for (let i = 1; i <= foldCount; i += 1) folds.push(i / (foldCount + 1) + (rng() - 0.5) * 0.05);
  const rivets: { x: number; y: number }[] = [];
  const rivetCount = role === 'torso' ? 6 : role === 'helm' ? 5 : 3;
  for (let i = 0; i < rivetCount; i += 1) {
    rivets.push({ x: 0.16 + rng() * 0.68, y: 0.12 + rng() * 0.64 });
  }
  const scratches: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < 5; i += 1) {
    const x1 = rng();
    const y1 = rng() * 0.8 + 0.1;
    const len = 0.08 + rng() * 0.16;
    const ang = (rng() - 0.5) * 0.9;
    scratches.push({ x1, y1, x2: x1 + Math.cos(ang) * len, y2: y1 + Math.sin(ang) * len });
  }
  return { folds, rivets, scratches };
}

function sub(rect: Rect, fraction: [number, number, number, number]): Rect {
  return {
    x: rect.x + fraction[0] * rect.w,
    y: rect.y + fraction[1] * rect.h,
    w: fraction[2] * rect.w,
    h: fraction[3] * rect.h,
  };
}

function vGradient(ctx: CanvasRenderingContext2D, rect: Rect, top: string, bottom: string): void {
  const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

function softHighlight(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

function drawRivet(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, base: string, hi: string, sh: string): void {
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(hi, 0.9);
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba(sh, 0.55);
  ctx.beginPath();
  ctx.arc(cx + r * 0.35, cy + r * 0.35, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function borderDarken(ctx: CanvasRenderingContext2D, rect: Rect, alpha: number): void {
  const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  g.addColorStop(0, rgba('#000000', alpha));
  g.addColorStop(0.12, 'rgba(0,0,0,0)');
  g.addColorStop(0.88, 'rgba(0,0,0,0)');
  g.addColorStop(1, rgba('#000000', alpha));
  ctx.fillStyle = g;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const gh = ctx.createLinearGradient(rect.x, 0, rect.x + rect.w, 0);
  gh.addColorStop(0, rgba('#000000', alpha));
  gh.addColorStop(0.12, 'rgba(0,0,0,0)');
  gh.addColorStop(0.88, 'rgba(0,0,0,0)');
  gh.addColorStop(1, rgba('#000000', alpha));
  ctx.fillStyle = gh;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
}

function stampNoise(ctx: CanvasRenderingContext2D, rect: Rect, seed: number, amount: number, alpha: number): void {
  const rng = mulberry32(seed + 99);
  for (let i = 0; i < amount; i += 1) {
    const x = rect.x + rng() * rect.w;
    const y = rect.y + rng() * rect.h;
    const r = 1 + rng() * 2;
    ctx.fillStyle = rng() > 0.5 ? rgba('#ffffff', alpha) : rgba('#000000', alpha);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function baseColorFor(role: Role, part: 'upper' | 'lower' | 'whole'): string {
  if (role === 'helm') return COLORS.steel;
  if (role === 'torso') return part === 'lower' ? COLORS.cloth : COLORS.steel;
  if (role === 'arm') return part === 'lower' ? COLORS.steel : COLORS.cloth;
  if (role === 'leg') return part === 'lower' ? COLORS.leather : COLORS.cloth;
  return COLORS.cape;
}

function paintBaseColor(ctx: CanvasRenderingContext2D, role: Role, rect: Rect, details: Details, seed: number): void {
  const split = role === 'torso' ? 0.62 : role === 'arm' ? 0.55 : role === 'leg' ? 0.68 : 1;
  const upper = sub(rect, [0, 0, 1, split]);
  const lower = split < 1 ? sub(rect, [0, split, 1, 1 - split]) : null;

  vGradient(ctx, upper, baseColorFor(role, 'upper'), rgba('#000000', 0.55));
  if (lower) vGradient(ctx, lower, baseColorFor(role, 'lower'), rgba('#000000', 0.55));

  // soft top-centre highlight = volume
  softHighlight(ctx, rect.x + rect.w * 0.5, rect.y + rect.h * 0.12, rect.w * 0.8, '#ffffff', 0.16);

  // metallic plate polish on steel regions
  if (role === 'helm' || role === 'torso' || role === 'arm') {
    const plate = sub(rect, [0.1, 0.08, 0.8, (role === 'torso' ? 0.5 : 0.42)]);
    ctx.fillStyle = rgba(COLORS.steelWorn, 0.5);
    ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
    ctx.fillStyle = rgba(COLORS.steelHi, 0.7);
    ctx.fillRect(plate.x, plate.y, plate.w, Math.max(2, plate.h * 0.05));
  }

  // cloth folds / cape folds
  if (role === 'cape' || role === 'torso' || role === 'arm' || role === 'leg') {
    const region = role === 'torso' && lower ? lower : role === 'arm' || role === 'leg' ? sub(rect, [0, split === 0.55 ? 0 : 0, 1, 1]) : rect;
    details.folds.forEach((fx, index) => {
      ctx.fillStyle = rgba(index % 2 === 0 ? COLORS.clothHi : COLORS.clothSh, 0.22);
      ctx.fillRect(region.x + fx * region.w - region.w * 0.04, region.y, region.w * 0.08, region.h);
    });
  }

  // belt + buckle on torso
  if (role === 'torso') {
    const belt = sub(rect, [0, 0.58, 1, 0.1]);
    ctx.fillStyle = COLORS.leather;
    ctx.fillRect(belt.x, belt.y, belt.w, belt.h);
    ctx.fillStyle = rgba(COLORS.leatherHi, 0.6);
    ctx.fillRect(belt.x, belt.y, belt.w, Math.max(2, belt.h * 0.2));
    const buckle = sub(rect, [0.42, 0.575, 0.16, 0.11]);
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(buckle.x, buckle.y, buckle.w, buckle.h);
    ctx.fillStyle = rgba(COLORS.goldHi, 0.8);
    ctx.fillRect(buckle.x, buckle.y, buckle.w, Math.max(2, buckle.h * 0.25));
  }

  // boot + gauntlet bottom shading
  if (role === 'leg') {
    const boot = sub(rect, [0, 0.68, 1, 0.32]);
    ctx.fillStyle = rgba(COLORS.leatherSh, 0.45);
    ctx.fillRect(boot.x, boot.y, boot.w, boot.h);
    ctx.fillStyle = rgba(COLORS.leatherHi, 0.7);
    ctx.fillRect(boot.x, boot.y + boot.h - boot.h * 0.16, boot.w, boot.h * 0.16);
  }
  if (role === 'arm') {
    const cuff = sub(rect, [0, 0.55, 1, 0.08]);
    ctx.fillStyle = rgba(COLORS.steelHi, 0.6);
    ctx.fillRect(cuff.x, cuff.y, cuff.w, cuff.h);
  }

  // visor slit on the helm (T-slit, safe on a sphere)
  if (role === 'helm') {
    const visor = sub(rect, [0.12, 0.42, 0.76, 0.1]);
    ctx.fillStyle = rgba(COLORS.clothSh, 0.85);
    ctx.fillRect(visor.x, visor.y, visor.w, visor.h);
    ctx.fillStyle = rgba(COLORS.steelHi, 0.6);
    ctx.fillRect(visor.x, visor.y - 3, visor.w, 3);
  }

  // rivets + wear scratches
  details.rivets.forEach((rivet) => {
    const cx = rect.x + rivet.x * rect.w;
    const cy = rect.y + rivet.y * rect.h;
    drawRivet(ctx, cx, cy, Math.max(3, rect.w * 0.02), COLORS.gold, COLORS.goldHi, COLORS.leatherSh);
  });
  details.scratches.forEach((scratch) => {
    ctx.strokeStyle = rgba(COLORS.steelHi, 0.5);
    ctx.lineWidth = Math.max(1.5, rect.w * 0.01);
    ctx.beginPath();
    ctx.moveTo(rect.x + scratch.x1 * rect.w, rect.y + scratch.y1 * rect.h);
    ctx.lineTo(rect.x + scratch.x2 * rect.w, rect.y + scratch.y2 * rect.h);
    ctx.stroke();
    ctx.strokeStyle = rgba(COLORS.steelSh, 0.5);
    ctx.beginPath();
    ctx.moveTo(rect.x + scratch.x1 * rect.w, rect.y + scratch.y1 * rect.h + 2);
    ctx.lineTo(rect.x + scratch.x2 * rect.w, rect.y + scratch.y2 * rect.h + 2);
    ctx.stroke();
  });

  borderDarken(ctx, rect, 0.28);
  stampNoise(ctx, rect, seed, Math.round(rect.w * 1.2), 0.03);
}

function paintNormal(ctx: CanvasRenderingContext2D, role: Role, rect: Rect, details: Details): void {
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // bevels around the plate region
  const plate = sub(rect, [0.1, 0.08, 0.8, role === 'torso' ? 0.5 : 0.42]);
  ctx.strokeStyle = '#9090ff';
  ctx.lineWidth = Math.max(1.5, rect.w * 0.008);
  ctx.strokeRect(plate.x, plate.y, plate.w, plate.h);
  ctx.strokeStyle = '#7070e8';
  ctx.strokeRect(plate.x + 2, plate.y + 2, plate.w, plate.h);
  details.rivets.forEach((rivet) => {
    const cx = rect.x + rivet.x * rect.w;
    const cy = rect.y + rivet.y * rect.h;
    softHighlight(ctx, cx - 2, cy - 2, rect.w * 0.03, '#c0c0ff', 0.9);
    softHighlight(ctx, cx + 2, cy + 2, rect.w * 0.03, '#5050c0', 0.7);
  });
  if (role === 'cape' || role === 'torso' || role === 'arm' || role === 'leg') {
    details.folds.forEach((fx) => {
      ctx.fillStyle = rgba('#a0a0ff', 0.25);
      ctx.fillRect(rect.x + fx * rect.w, rect.y, Math.max(1, rect.w * 0.02), rect.h);
    });
  }
}

function paintRoughness(ctx: CanvasRenderingContext2D, role: Role, rect: Rect, details: Details, seed: number): void {
  const map: Record<Role, number> = { helm: 110, torso: 150, arm: 150, leg: 190, cape: 230 };
  const v = map[role];
  ctx.fillStyle = `rgb(${v},${v},${v})`;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // polish the plate (darker = glossier)
  const plate = sub(rect, [0.12, 0.1, 0.76, role === 'torso' ? 0.46 : 0.38]);
  ctx.fillStyle = rgba('#000000', 0.28);
  ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
  // fabric grain
  if (role === 'cape' || role === 'leg') stampNoise(ctx, rect, seed + 7, Math.round(rect.w * 1.6), 0.06);
  details.scratches.forEach((scratch) => {
    ctx.strokeStyle = rgba('#ffffff', 0.5);
    ctx.lineWidth = Math.max(1.2, rect.w * 0.008);
    ctx.beginPath();
    ctx.moveTo(rect.x + scratch.x1 * rect.w, rect.y + scratch.y1 * rect.h);
    ctx.lineTo(rect.x + scratch.x2 * rect.w, rect.y + scratch.y2 * rect.h);
    ctx.stroke();
  });
}

function paintMetallic(ctx: CanvasRenderingContext2D, role: Role, rect: Rect): void {
  ctx.fillStyle = role === 'cape' || role === 'leg' ? '#000000' : '#000000';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  // steel regions → white (hard edges)
  if (role === 'helm') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  } else if (role === 'torso') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h * 0.58);
    const belt = sub(rect, [0.42, 0.575, 0.16, 0.11]);
    ctx.fillRect(belt.x, belt.y, belt.w, belt.h);
  } else if (role === 'arm') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rect.x, rect.y + rect.h * 0.55, rect.w, rect.h * 0.45);
  } else if (role === 'leg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rect.x, rect.y + rect.h * 0.86, rect.w, rect.h * 0.14);
  }
}

function paintAo(ctx: CanvasRenderingContext2D, role: Role, rect: Rect): void {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const contact = (fraction: [number, number, number, number], alpha: number) => {
    const r = sub(rect, fraction);
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, rgba('#111111', alpha));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  };
  if (role === 'helm') contact([0, 0.82, 1, 0.18], 0.5);
  if (role === 'torso') {
    contact([0, 0.5, 1, 0.14], 0.45);
    contact([0, 0.94, 1, 0.06], 0.5);
  }
  if (role === 'arm') contact([0, 0.5, 1, 0.12], 0.4);
  if (role === 'leg') {
    contact([0, 0.62, 1, 0.12], 0.4);
    contact([0, 0.94, 1, 0.06], 0.5);
  }
  if (role === 'cape') contact([0, 0.9, 1, 0.1], 0.4);
}

function paintEmissive(ctx: CanvasRenderingContext2D, role: Role, rect: Rect): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (role !== 'cape') return;
  const rng = mulberry32(4242);
  for (let i = 0; i < 3; i += 1) {
    const cx = rect.x + rect.w * (0.25 + i * 0.25);
    const cy = rect.y + rect.h * 0.5;
    softHighlight(ctx, cx, cy, rect.w * 0.14, COLORS.rune, 0.35);
    ctx.strokeStyle = COLORS.rune;
    ctx.lineWidth = Math.max(3, rect.w * 0.02);
    ctx.beginPath();
    ctx.moveTo(cx - rect.w * 0.04, cy - rect.h * 0.18);
    ctx.lineTo(cx + rect.w * 0.02, cy);
    ctx.lineTo(cx - rect.w * 0.02, cy + rect.h * 0.18);
    ctx.stroke();
    ctx.strokeStyle = COLORS.runeCore;
    ctx.lineWidth = Math.max(1.5, rect.w * 0.008);
    ctx.stroke();
    rng();
  }
}

/** Paints one example map with the same ops a human would use. */
export function generateKnightMapDataUrl(mapType: MapType, size = 1024): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  if (mapType === 'normal') {
    ctx.fillStyle = '#8080ff';
  } else if (mapType === 'ao' || mapType === 'roughness' || mapType === 'metallic') {
    ctx.fillStyle = mapType === 'metallic' ? '#000000' : '#ffffff';
  } else {
    ctx.fillStyle = '#000000';
  }
  ctx.fillRect(0, 0, size, size);

  PLAYER_KNIGHT_UV.forEach((island, index) => {
    const rect: Rect = { x: island.x * size, y: island.y * size, w: island.w * size, h: island.h * size };
    const role = roleFor(island.name);
    const seed = 1000 + index * 97;
    const details = detailsFor(role, seed);
    if (mapType === 'basecolor') paintBaseColor(ctx, role, rect, details, seed);
    else if (mapType === 'normal') paintNormal(ctx, role, rect, details);
    else if (mapType === 'roughness') paintRoughness(ctx, role, rect, details, seed);
    else if (mapType === 'metallic') paintMetallic(ctx, role, rect);
    else if (mapType === 'ao') paintAo(ctx, role, rect);
    else if (mapType === 'emissive') paintEmissive(ctx, role, rect);
  });

  return canvas.toDataURL('image/png');
}

/** Built-in example case: a character model that needs a full PBR texture set. */
export function getPlayerKnightBlueprint(): SceneBlueprint {
  return {
    kind: 'model',
    name: PLAYER_KNIGHT_NAME,
    description:
      'Beispiel: der Held des Spiels als 3D-Modell (Low-Poly). Ein Mesh, ein Material — braucht ein komplettes PBR-Texturset, das sich Auflösung und UV teilt. UV-Inseln: HEAD, TORSO, ARM L/R, LEG L/R, CAPE.',
    artDirection:
      'Handgemalt über PBR, Miniatur/Diorama-Look. Warmes Hauptlicht von oben links, kühles blaues Rim von hinten rechts. Stahl, Leder, Stoff — klare Silhouette, weiche Innenformen.',
    target: 'unreal',
    canvas: { width: 2048, height: 2048, background: '#0b0d12' },
    uvLayout: PLAYER_KNIGHT_UV,
    uvTemplate: createUvTemplate(PLAYER_KNIGHT_UV),
    mesh: buildKnightMesh(),
    maps: [
      { map: 'basecolor', brief: 'Farben pro Insel (Helm, Brustplatte + Rock, Ärmel/Handschuh, Hose/Stiefel, Umhang). Oben an jeder Insel ist „oben" am Körper. Zuerst Volumen (Verlauf), dann Details.' },
      { map: 'normal', brief: 'Relief: Bevels an Platten-/Materialkanten, Nieten als Bumps, Falten. Grundton flach #8080ff.' },
      { map: 'roughness', brief: 'Graustufen: Stahl glänzend (dunkel), Stoff/Leder matt (hell). Kratzer an denselben Stellen wie im BaseColor.' },
      { map: 'metallic', brief: 'Harte Schwarz/Weiß-Maske: weiß = Stahl/Nieten/Schließe, schwarz = Stoff/Leder/Haut.' },
      { map: 'ao', brief: 'Nur Kontaktzonen abdunkeln: Hals, Gürtel, Stiefelrand, Falten. Überwiegend weiß.' },
      { map: 'emissive', brief: 'Schwarz, außer glühende Runen am Umhang (kaltes Blau).', optional: true },
    ],
  };
}

/** The same case, imported fully painted (for testing the 3D preview). */
export function getPlayerKnightPaintedBlueprint(): SceneBlueprint {
  return {
    ...getPlayerKnightBlueprint(),
    name: `${PLAYER_KNIGHT_NAME} (bemalt)`,
    description: 'Beispiel mit fertig gemalten PBR-Texturen — zum Ausprobieren der 3D-Vorschau und des Exports.',
  };
}
