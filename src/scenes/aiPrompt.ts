import type { Language } from '../i18n';

const SCHEMA_EXAMPLE = `{
  "name": "Szenenname",
  "description": "Kurze Beschreibung des Ortes/Features",
  "artDirection": "Stil, Palette, Lichtstimmung",
  "canvas": { "width": 960, "height": 540, "background": "#0b0d12" },
  "assets": [
    {
      "title": "Holzkiste",
      "type": "prop",
      "dimensions": { "width": 160, "height": 160 },
      "background": "transparent",
      "brief": "Kurze, klare Malanweisung (Stil, Licht, Palette, Kanten, Transparenz).",
      "layout": { "x": 616, "y": 332, "width": 150, "height": 150, "layer": 7 }
    }
  ]
}`;

export function buildAiPrompt(language: Language): string {
  if (language === 'en') {
    return `You are the production assistant for hand-made 2D game art in the tool "Creative Collab Studio".

Task: break the scene or feature below into concrete asset requirements and return ONLY a JSON blueprint — no text before or after.

Scene / feature:
<DESCRIBE THE SCENE OR FEATURE HERE>

Output format (JSON):
${SCHEMA_EXAMPLE}

Rules:
- Exactly one ticket per asset. Do not bundle assets.
- "type" is one of: texture, prop, ui, concept, effect, character, other.
- "background": "white" for textures, "transparent" for props/effects, optionally "dark"/"paper".
- Textures: seamless and power-of-two sizes (e.g. 512x512). Props: sensible pixel sizes.
- "brief": short, clear painting instruction (style, lighting, palette, edges, transparency).
- "layout": x/y/width/height in scene-canvas coordinates; "layer" controls depth (small = back).
- "canvas": pick a size that fits the scene (e.g. 960x540).
- Language: English. Keep the JSON valid.`;
  }
  return `Du bist Produktionsassistent für handgemachte 2D-Game-Art im Tool "Creative Collab Studio".

Aufgabe: Zerlege die folgende Szene bzw. das Feature in konkrete Asset-Anforderungen und gib NUR ein JSON-Blueprint zurück — kein Text davor oder danach.

Szene / Feature:
<HIER DIE SZENE ODER DAS FEATURE BESCHREIBEN>

Ausgabeformat (JSON):
${SCHEMA_EXAMPLE}

Regeln:
- Genau ein Ticket pro Asset. Nichts bündeln.
- "type" ist eines von: texture, prop, ui, concept, effect, character, other.
- "background": "white" für Texturen, "transparent" für Requisiten/Effekte, optional "dark"/"paper".
- Texturen: nahtlos und in Zweierpotenzen (z. B. 512×512). Requisiten: sinnvolle Pixelmaße.
- "brief": kurze, klare Malanweisung (Stil, Licht, Palette, Kanten, Transparenz).
- "layout": x/y/width/height in Szenen-Canvas-Koordinaten; "layer" steuert die Tiefe (klein = hinten).
- "canvas": passende Größe wählen (z. B. 960×540).
- Sprache: Deutsch. Halte das JSON gültig.`;
}
