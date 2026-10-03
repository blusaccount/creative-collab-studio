import type { MeshSpec, SceneBlueprint, UvIsland } from '../types';

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

/** A simple, readable UV layout (checker + islands + labels + "up" bars) as an SVG data URL. */
export function createUvTemplate(layout: UvIsland[]): string {
  const size = 1024;
  const cell = size / 8;
  const escape = (value: string) =>
    value.replace(/[<>&"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[character] ?? character);
  const checker: string[] = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const fill = (x + y) % 2 === 0 ? '#161922' : '#1d2130';
      checker.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${fill}"/>`);
    }
  }
  const islands = layout.map((island) => {
    const x = island.x * size;
    const y = island.y * size;
    const w = island.w * size;
    const h = island.h * size;
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#4cc2ff" fill-opacity=".12" stroke="#ffffff" stroke-opacity=".85" stroke-width="2"/>` +
      `<rect x="${x}" y="${y}" width="${w}" height="5" fill="#4cc2ff" fill-opacity=".6"/>` +
      `<text x="${x + 16}" y="${y + 34}" fill="#ffffff" font-family="Segoe UI,Arial,sans-serif" font-size="26" font-weight="600">${escape(island.name)}</text>`
    );
  });
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    checker.join('') +
    islands.join('') +
    `<rect x="3" y="3" width="${size - 6}" height="${size - 6}" fill="none" stroke="#4cc2ff" stroke-width="6"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Built-in example case: a character model that needs a full PBR texture set. */
export function getPlayerKnightBlueprint(): SceneBlueprint {
  return {
    id: 'player-knight',
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
    maps: PLAYER_KNIGHT_UV.flatMap((island) => [
      {
        id: `knight-${island.name.toLowerCase().replace(/\s+/g, '-')}`,
        part: island.name,
        map: 'basecolor' as const,
        brief: `Farben und Details für ${island.name}.`,
        priority: island.name === 'HEAD' || island.name === 'TORSO' ? ('high' as const) : ('medium' as const),
        acceptanceCriteria: [
          'Stahl, Leder und Stoff klar unterscheidbar',
          'Licht von oben links eingemalt',
          'Liest sich in der 3D-Vorschau auf Spielkamera-Distanz',
        ],
      },
      { part: island.name, map: 'normal' as const, brief: `Relief für ${island.name}: Bevels, Nieten und Falten. Grundton #8080ff.` },
      { part: island.name, map: 'roughness' as const, brief: `Rauheit für ${island.name}: Stahl glänzend (dunkel), Stoff/Leder matt (hell).` },
      { part: island.name, map: 'metallic' as const, brief: `Metallanteil für ${island.name}: Stahl/Nieten weiß, Stoff/Leder/Haut schwarz.` },
      { part: island.name, map: 'ao' as const, brief: `Kontakt-Schatten für ${island.name}; überwiegend weiß.` },
      ...(island.name === 'CAPE'
        ? [{ part: island.name, map: 'emissive' as const, brief: 'Schwarz, außer den glühenden Runen am Umhang.' }]
        : []),
    ]),
  };
}
