import type { Language } from '../i18n';

export const SCENE_SCHEMA = `{
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

export const MODEL_SCHEMA = `{
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
      { "name": "torso", "shape": "box",      "size": [0.85, 0.95, 0.5],  "position": [0, 0.7, 0],  "uv": [0.5, 0.06, 0.44, 0.4] }
    ]
  },
  "maps": [
    { "map": "basecolor", "part": "head",  "brief": "Paint the helmet and face; keep the visor and skin clearly distinct." },
    { "map": "roughness", "part": "head",  "brief": "Keep the metal helmet glossy and exposed skin matte." },
    { "map": "basecolor", "part": "torso", "brief": "Paint the breastplate and cloth panels; keep their edges readable." },
    { "map": "roughness", "part": "torso", "brief": "Make the breastplate glossy and the cloth matte." }
  ]
}`;

/** Blueprint rules, shared by the copy-paste prompt and the AI bridge's MCP guide. */
export const BLUEPRINT_RULES_EN = `- Exactly one ticket per 2D asset. For a model with distinct, independently paintable parts, create one part ticket per meaningful part; do not combine unrelated body parts on one canvas. A simple, inseparable model gets one ticket.
- For model-part tickets, define one "uvLayout" rectangle per paintable part, use the same exact name in the corresponding "mesh.parts[].name" and every channel map's "part", and make the mesh part's "uv" rectangle match that UV region. Every channel entry for a given part must use that part name; repeating map entries groups those channels onto one ticket.
- Give each part a concise, actionable "brief" that says what to paint and where; do not reuse a generic whole-model instruction for every part. Include BaseColor and only the additional material channels actually needed for that part.
- 2D "type": texture, prop, ui, concept, effect, character, other.
- For models, all parts and their channels belong in ONE "model" blueprint (group). Keep each part's material channels together on its part ticket.
- "background": "white" for BaseColor/emissive/textures, "transparent" for normal/roughness/metallic/AO and props.
- Textures seamless and power-of-two; for models use the same resolution for all maps.
- "brief": short, clear painting instruction (style, lighting, palette, edges, transparency).
- "target" (models only): unreal | unity | gltf.
- Use "part" on map entries only when the name matches a uvLayout region and mesh part; provide the full set of relevant maps for each part. When texturing an existing model, use its real UV reference and do not invent placements; when designing a new procedural preview, define the mesh-part UV rectangles and uvLayout together.
- For EVERY model set you MUST include the model so textures can be previewed: provide "modelUrl" (a real .glb) OR a "mesh" spec (primitives). A "mesh" part = { shape: box|cylinder|sphere, size:[w,h,d], position:[x,y,z], uv:[x,y,w,h] } in 0–1 texture space; the parts must line up with the map layout.
- For updates: set a stable "id" + "action": "upsert" so entries are updated instead of duplicated.
- In model updates, keep the same stable "id" on each part's BaseColor map so its ticket and existing paint are retained; omit map ids on other channels.
- Optional per entry: "priority" (low|medium|high), "purpose", "acceptanceCriteria" (done-when), "references".
- "layout" (scenes only): x/y/width/height in scene-canvas coordinates; "layer" depth (small = back).`;

export function buildAiPrompt(language: Language): string {
  if (language === 'en') {
    return `You are the production assistant for hand-made 2D and 3D game art in the tool "Creative Collab Studio".

Task: break the scene or feature below into concrete asset requirements and return ONLY a JSON blueprint — no text before or after.

Pick the right type:
- 2D scene/environment → kind "scene" with "assets" (one ticket per asset).
- 3D model (one mesh/material) → kind "model" with "maps". These are channels on ONE model-paint ticket, not separate asset tickets. BaseColor is painted as colour; Metallic, Roughness and AO are painted as material values on the model or UV canvas.
- For a model with separately paintable parts (for example head, torso, arms), create one ticket per part in the same model group. Every part needs its own named UV region and focused paint brief; keep its material channels together on that ticket.

Scene / feature:
<DESCRIBE THE SCENE OR FEATURE HERE>

Format for 2D scenes:
${SCENE_SCHEMA}

Format for 3D models (texture group):
${MODEL_SCHEMA}

Rules:
${BLUEPRINT_RULES_EN}
- Language: English. Keep the JSON valid.`;
  }
  return `Du bist Produktionsassistent für handgemachte 2D- und 3D-Game-Art im Tool "Creative Collab Studio".

Aufgabe: Zerlege die folgende Szene bzw. das Feature in konkrete Asset-Anforderungen und gib NUR ein JSON-Blueprint zurück — kein Text davor oder danach.

Wähle den passenden Typ:
- 2D-Szene/Umgebung → kind "scene" mit "assets" (ein Ticket pro Asset).
- 3D-Modell (ein Mesh/Material mit mehreren Kanälen) → kind "model" mit "maps". Alle Kanäle gehören zu EINEM Modell-Mal-Ticket: BaseColor wird normal farbig gemalt; Metallic, Roughness und AO sind Materialeigenschaften, die per Pinselwert direkt am Modell oder auf dem UV-Canvas gemalt werden.
- Bei einem Modell mit getrennt bemalbaren Teilen (z. B. Kopf, Torso, Arme) erstelle pro Teil ein eigenes Ticket in derselben Modell-Gruppe. Jedes Teil braucht einen eigenen benannten UV-Bereich und eine gezielte Malanweisung; seine Materialkanäle bleiben gemeinsam auf diesem Ticket.

Szene / Feature:
<HIER DIE SZENE ODER DAS FEATURE BESCHREIBEN>

Format für 2D-Szenen:
${SCENE_SCHEMA}

Format für 3D-Modelle (Textur-Gruppe):
${MODEL_SCHEMA}

Regeln:
- Genau ein Ticket pro 2D-Asset. Bei klar getrennten, unabhängig bemalbaren Modellteilen erstelle je ein Ticket pro sinnvollem Teil; verschiedene Körperteile nicht auf einem gemeinsamen Canvas zusammenfassen. Ein einfaches, nicht sinnvoll teilbares Modell erhält ein Ticket.
- Für Modellteil-Tickets: Definiere pro bemalbarem Teil genau einen benannten "uvLayout"-Bereich. Verwende denselben Namen in "mesh.parts[].name" und bei "part" jeder zugehörigen Map; das "uv"-Rechteck des Mesh-Teils muss exakt zum UV-Bereich passen. Alle Maps eines Teils müssen denselben "part"-Namen tragen und werden dadurch auf einem Ticket gruppiert.
- Gib jedem Teil eine kurze, konkrete Malanweisung, was und wo zu malen ist; verwende keine allgemeine Modellbeschreibung für alle Teile. Füge BaseColor und nur tatsächlich benötigte zusätzliche Materialkanäle hinzu.
- 2D "type": texture, prop, ui, concept, effect, character, other.
- Für Modelle gehören alle Teile und Kanäle in EIN "model"-Blueprint (Gruppe); die Kanäle jedes Teils bleiben auf dessen Ticket zusammen.
- "background": "white" für BaseColor/Emissive/Texturen, "transparent" für Normal/Roughness/Metallic/AO und Requisiten.
- Texturen nahtlos und in Zweierpotenzen; für Modelle gleiche Auflösung für alle Maps.
- "brief": kurze, klare Malanweisung (Stil, Licht, Palette, Kanten, Transparenz).
- "target" (nur Modelle): unreal | unity | gltf.
- "part" bei Maps nur verwenden, wenn der Wert zu einem uvLayout-Bereich und Mesh-Teil passt; pro Teil die benötigten Kanäle angeben. Bei einem vorhandenen Modell die echten UV-Daten verwenden und keine Platzierung erfinden; bei einer neu entworfenen prozeduralen Vorschau Mesh-UV-Rechtecke und uvLayout gemeinsam festlegen.
- Für JEDES Modell-Set MUSST du das Modell mitliefern, damit die Texturplatzierung sichtbar ist: entweder "modelUrl" (echte .glb) ODER eine "mesh"-Spezifikation (Primitive). Ein mesh-Teil = { shape: box|cylinder|sphere, size:[w,h,d], position:[x,y,z], uv:[x,y,w,h] } im 0–1-Texturraum; die Teile müssen zum Map-Layout passen.
- Für Updates: stabil "id" + "action": "upsert" setzen — dann werden bestehende Einträge aktualisiert statt dupliziert.
- Bei Modell-Updates auf jeder BaseColor-Map eines Teils dieselbe stabile, eindeutige "id" beibehalten, damit Ticket und Malerei erhalten bleiben; andere Kanäle erhalten keine Map-id.
- Optional pro Eintrag: "priority" (low|medium|high), "purpose" (wofür), "acceptanceCriteria" (wann fertig), "references" (URLs/Bilder).
- "layout" (nur Szenen): x/y/width/height in Szenen-Canvas-Koordinaten; "layer" = Tiefe (klein = hinten).
- Sprache: Deutsch. Halte das JSON gültig.`;
}
