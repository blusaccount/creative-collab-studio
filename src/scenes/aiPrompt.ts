import type { Language } from '../i18n';

const SCENE_SCHEMA = `{
  "schemaVersion": 3,
  "action": "upsert",                       // "create" | "upsert" (upsert re-uses a stable "id")
  "id": "scene-<slug>",                     // optional, stable — needed for updates
  "kind": "scene",
  "name": "Scene name",
  "description": "Short description of the place/feature",
  "artDirection": "Style, palette, lighting",
  "canvas": { "width": 960, "height": 540, "background": "#0b0d12" },
  "assets": [
    {
      "id": "asset-wooden-crate",           // optional, stable
      "title": "Wooden crate",
      "type": "prop",
      "priority": "medium",                 // low | medium | high (optional)
      "purpose": "Shelf prop in the corner (optional)",
      "acceptanceCriteria": ["no outer glow", "readable at 64px (optional)"],
      "dimensions": { "width": 160, "height": 160 },
      "background": "transparent",
      "brief": "Short, clear painting instruction (style, light, palette, edges, transparency).",
      "layout": { "x": 616, "y": 332, "width": 150, "height": 150, "layer": 7 }
    }
  ]
}`;

const MODEL_SCHEMA = `{
  "schemaVersion": 3,
  "action": "upsert",                       // "create" | "upsert"
  "id": "model-<slug>",                     // optional, stable
  "kind": "model",
  "name": "Player – Knight",
  "description": "What is the model for?",
  "artDirection": "Style, light, materials",
  "target": "unreal",                       // unreal | unity | gltf
  "canvas": { "width": 2048, "height": 2048, "background": "#0b0d12" },  // texture resolution
  "uvTemplate": "<optional: URL/base64 of the UV wireframe PNG>",
  "uvLayout": [
    { "name": "head",  "x": 0.06, "y": 0.06, "w": 0.36, "h": 0.28 },
    { "name": "torso", "x": 0.5,  "y": 0.06, "w": 0.44, "h": 0.4 }
  ],
  "modelUrl": "<optional: URL of a real .glb model>",
  "mesh": {
    "parts": [
      { "name": "head",  "shape": "sphere",   "size": [0.6, 0.6, 0.6],    "position": [0, 1.5, 0],  "uv": [0.06, 0.06, 0.36, 0.28] },
      { "name": "torso", "shape": "box",      "size": [0.85, 0.95, 0.5],  "position": [0, 0.7, 0],  "uv": [0.5, 0.06, 0.44, 0.4] },
      { "name": "arm",   "shape": "cylinder", "size": [0.24, 0.9, 0.24],  "position": [-0.62, 0.62, 0], "uv": [0.06, 0.4, 0.18, 0.34] }
    ]
  },
  "maps": [
    { "map": "basecolor", "brief": "Base colours, leather + metal", "priority": "high", "purpose": "The visible colours", "acceptanceCriteria": ["cohesive palette"] },
    { "map": "normal",    "brief": "Seams, rivets, armour edges" },
    { "map": "roughness", "brief": "Leather matte, metal glossy" },
    { "map": "metallic",  "brief": "Metal 1, leather 0" },
    { "map": "ao",        "brief": "Darken seams/armour edges" },
    { "map": "emissive",  "brief": "Glowing runes", "optional": true }
  ]
}`;

export function buildAiPrompt(language: Language): string {
  if (language === 'en') {
    return `You are the production assistant for hand-made 2D and 3D game art in the tool "Creative Collab Studio".

Task: break the scene or feature below into concrete asset requirements and return ONLY a JSON blueprint — no text before or after.

Pick the right type:
- 2D scene/environment → kind "scene" with "assets" (one ticket per asset).
- 3D model (one mesh needs several textures) → kind "model" with "maps". A model is a GROUP of texture tickets (BaseColor, Normal, Roughness, Metallic, AO, Emissive …) that share resolution and UVs.

Scene / feature:
<DESCRIBE THE SCENE OR FEATURE HERE>

Format for 2D scenes:
${SCENE_SCHEMA}

Format for 3D models (texture group):
${MODEL_SCHEMA}

Rules:
- Exactly one ticket per asset / per texture map. Do not bundle.
- 2D "type": texture, prop, ui, concept, effect, character, other.
- For models, every map of one material belongs in ONE "model" blueprint (group).
- "background": "white" for BaseColor/emissive/textures, "transparent" for normal/roughness/metallic/AO and props.
- Textures seamless and power-of-two; for models use the same resolution for all maps.
- "brief": short, clear painting instruction (style, lighting, palette, edges, transparency).
- "target" (models only): unreal | unity | gltf.
- For EVERY model set you MUST include the model so textures can be previewed: provide "modelUrl" (a real .glb) OR a "mesh" spec (primitives). A "mesh" part = { shape: box|cylinder|sphere, size:[w,h,d], position:[x,y,z], uv:[x,y,w,h] } in 0–1 texture space; the parts must line up with the map layout.
- For updates: set a stable "id" + "action": "upsert" so entries are updated instead of duplicated.
- Optional per entry: "priority" (low|medium|high), "purpose", "acceptanceCriteria" (done-when), "references".
- "layout" (scenes only): x/y/width/height in scene-canvas coordinates; "layer" depth (small = back).
- Language: English. Keep the JSON valid.`;
  }
  return `Du bist Produktionsassistent für handgemachte 2D- und 3D-Game-Art im Tool "Creative Collab Studio".

Aufgabe: Zerlege die folgende Szene bzw. das Feature in konkrete Asset-Anforderungen und gib NUR ein JSON-Blueprint zurück — kein Text davor oder danach.

Wähle den passenden Typ:
- 2D-Szene/Umgebung → kind "scene" mit "assets" (ein Ticket pro Asset).
- 3D-Modell (ein Mesh braucht mehrere Texturen) → kind "model" mit "maps". Ein Modell ist eine GRUPPE von Textur-Tickets (BaseColor, Normal, Roughness, Metallic, AO, Emissive …), die sich Auflösung und UV teilen.

Szene / Feature:
<HIER DIE SZENE ODER DAS FEATURE BESCHREIBEN>

Format für 2D-Szenen:
${SCENE_SCHEMA}

Format für 3D-Modelle (Textur-Gruppe):
${MODEL_SCHEMA}

Regeln:
- Genau ein Ticket pro Asset bzw. pro Textur-Map. Nichts bündeln.
- 2D "type": texture, prop, ui, concept, effect, character, other.
- Für Modelle gehört jede Map eines Materials in EIN "model"-Blueprint (Gruppe).
- "background": "white" für BaseColor/Emissive/Texturen, "transparent" für Normal/Roughness/Metallic/AO und Requisiten.
- Texturen nahtlos und in Zweierpotenzen; für Modelle gleiche Auflösung für alle Maps.
- "brief": kurze, klare Malanweisung (Stil, Licht, Palette, Kanten, Transparenz).
- "target" (nur Modelle): unreal | unity | gltf.
- Für JEDES Modell-Set MUSST du das Modell mitliefern, damit die Texturplatzierung sichtbar ist: entweder "modelUrl" (echte .glb) ODER eine "mesh"-Spezifikation (Primitive). Ein mesh-Teil = { shape: box|cylinder|sphere, size:[w,h,d], position:[x,y,z], uv:[x,y,w,h] } im 0–1-Texturraum; die Teile müssen zum Map-Layout passen.
- Für Updates: stabil "id" + "action": "upsert" setzen — dann werden bestehende Einträge aktualisiert statt dupliziert.
- Optional pro Eintrag: "priority" (low|medium|high), "purpose" (wofür), "acceptanceCriteria" (wann fertig), "references" (URLs/Bilder).
- "layout" (nur Szenen): x/y/width/height in Szenen-Canvas-Koordinaten; "layer" = Tiefe (klein = hinten).
- Sprache: Deutsch. Halte das JSON gültig.`;
}
