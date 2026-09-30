import { getLanguage, t } from '../i18n';
import { Modal } from './Modal';
import { Icon } from './Icon';

interface Section {
  heading: string;
  body?: string;
  list?: string[];
  code?: string;
}

const CONTENT: Record<'de' | 'en', { intro: string; sections: Section[] }> = {
  de: {
    intro:
      'Dieses Tool ist eine Ticket-Pipeline für handgemachte Game-Art. Die KI ist der Produktionsassistent: Sie zerlegt eine Szene in konkrete Asset-Anforderungen und legt daraus Tickets an. Gemalt wird vom Menschen.',
    sections: [
      {
        heading: 'Rolle der KI',
        body:
          'Die KI plant und strukturiert, sie zeichnet nicht. Sie erstellt einen Szenen-Blueprint (JSON) mit einem Ticket pro benötigtem Asset. Der Mensch öffnet die Tickets, malt die Assets und markiert sie als fertig.',
      },
      {
        heading: 'Ablauf',
        list: [
          'Szene in ihre Bestandteile zerlegen (Boden, Wände, Requisiten, Effekte, UI …).',
          'Für jedes benötigte Asset ein Ticket im Blueprint definieren.',
          'Den Blueprint in der Szene-Ansicht über „Importieren" laden — daraus entstehen automatisch alle Tickets.',
          'Der Künstler malt die Tickets und setzt sie auf „Fertig".',
          'Fertige Assets als PNG exportieren (transparent, versioniert) — in der Assets-Ansicht auch gesammelt in einen Ordner.',
        ],
      },
      {
        heading: 'Blueprint-Format (JSON)',
        body:
          'Eine Szene mit Canvas und einer Liste von Assets. Koordinaten beziehen sich auf die Szenen-Canvas; „layer" bestimmt die Reihenfolge (klein = hinten).',
        code: `{
  "name": "Szenenname",
  "description": "Was ist das für ein Ort?",
  "artDirection": "Stil, Palette, Lichtstimmung …",
  "canvas": { "width": 960, "height": 540, "background": "#0b0d12" },
  "assets": [
    {
      "title": "Holzkiste",
      "type": "prop",                 // texture | prop | ui | concept | effect | character | other
      "dimensions": { "width": 160, "height": 160 },
      "background": "transparent",    // white | transparent | dark | paper
      "brief": "Kurze, klare Malanweisung (Stil, Kanten, Palette).",
      "layout": { "x": 616, "y": 332, "width": 150, "height": 150, "layer": 7 }
    }
  ]
}`,
      },
      {
        heading: 'Regeln für gute Tickets',
        list: [
          'Genau ein Ticket pro Asset — nicht mehrere Assets in einem Ticket bündeln.',
          'Kurzer, eindeutiger Titel (wird zum Dateinamen).',
          'Korrektes Feld „type" wählen — es steuert die Ordnerstruktur beim Export.',
          'Texturen: nahtlos und in Zweierpotenzen (z. B. 512×512). Requisiten/Effekte: Hintergrund „transparent".',
          'Malanweisung im „brief": Stil, Licht, Palette, Kanten, ob Transparenz nötig ist.',
          'Layout so setzen, dass die Assets am Ende eine stimmige Szene ergeben.',
          'Keine Duplikate; Namen wiederverwendbar und eindeutig halten.',
        ],
      },
      {
        heading: 'Importieren',
        body:
          'Szene-Ansicht öffnen → „Importieren" (Blueprint-JSON) oder „Demo laden". Über „Plan exportieren" lässt sich ein bestehender Plan wieder als JSON ausgeben.',
      },
    ],
  },
  en: {
    intro:
      'This tool is a ticket pipeline for hand-made game art. The AI is the production assistant: it breaks a scene into concrete asset requirements and turns them into tickets. The human does the painting.',
    sections: [
      {
        heading: 'AI role',
        body:
          'The AI plans and structures, it does not draw. It authors a scene blueprint (JSON) with one ticket per required asset. The human opens the tickets, paints the assets and marks them complete.',
      },
      {
        heading: 'Flow',
        list: [
          'Break the scene into its parts (floor, walls, props, effects, UI …).',
          'Define one ticket per required asset in the blueprint.',
          'Import the blueprint in the Scene view via “Import” — all tickets are created automatically.',
          'The artist paints the tickets and sets them to “Complete”.',
          'Export finished assets as PNG (transparent, versioned) — the Assets view can export them into a folder.',
        ],
      },
      {
        heading: 'Blueprint format (JSON)',
        body:
          'A scene with a canvas and a list of assets. Coordinates are relative to the scene canvas; “layer” controls order (small = back).',
        code: `{
  "name": "Scene name",
  "description": "What kind of place is this?",
  "artDirection": "Style, palette, lighting …",
  "canvas": { "width": 960, "height": 540, "background": "#0b0d12" },
  "assets": [
    {
      "title": "Wooden crate",
      "type": "prop",                 // texture | prop | ui | concept | effect | character | other
      "dimensions": { "width": 160, "height": 160 },
      "background": "transparent",    // white | transparent | dark | paper
      "brief": "Short, clear painting instruction (style, edges, palette).",
      "layout": { "x": 616, "y": 332, "width": 150, "height": 150, "layer": 7 }
    }
  ]
}`,
      },
      {
        heading: 'Rules for good tickets',
        list: [
          'Exactly one ticket per asset — do not bundle several assets into one ticket.',
          'Short, unique title (it becomes the file name).',
          'Pick the correct “type” — it drives the export folder structure.',
          'Textures: seamless and power-of-two (e.g. 512×512). Props/effects: background “transparent”.',
          'Brief: style, lighting, palette, edges, whether transparency is needed.',
          'Set the layout so the assets form a coherent scene.',
          'No duplicates; keep names reusable and unique.',
        ],
      },
      {
        heading: 'Importing',
        body:
          'Open the Scene view → “Import” (blueprint JSON) or “Load demo”. “Export plan” writes an existing plan back out as JSON.',
      },
    ],
  },
};

export function AiGuideDialog({ onClose }: { onClose: () => void }) {
  const content = CONTENT[getLanguage()];
  return (
    <Modal title={t('app.aiGuide')} onClose={onClose} width={720}>
      <p className="guide-intro">{content.intro}</p>
      {content.sections.map((section) => (
        <section key={section.heading} className="guide-section">
          <h3>
            <Icon name="bot" size={15} /> {section.heading}
          </h3>
          {section.body ? <p>{section.body}</p> : null}
          {section.list ? (
            <ul>
              {section.list.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {section.code ? <pre className="guide-code">{section.code}</pre> : null}
        </section>
      ))}
    </Modal>
  );
}
