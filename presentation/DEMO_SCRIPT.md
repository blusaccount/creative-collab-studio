# Demo-Skript — Creative Collab Studio

Zielgruppe: Boss / Business. Dauer: ca. 8 Minuten. Fokus: **KI plant, der Mensch malt, Assets fließen zurück in die KI/DAM.**

---

## Kernbotschaft (roter Faden)

> KI schreibt den Code und erkennt, welche Assets eine Szene oder ein Modell braucht.
> Sie stellt die Anforderungen als strukturierte **Tickets** an menschliche Artists — mit Brief, Maßen und „Fertig, wenn …“.
> Der Mensch malt jedes Asset von Hand — im Tool oder in Photoshop.
> Ein Mensch gibt es frei, dann geht das Asset **zurück an die KI / in die DAM**.
> Ergebnis: keine AI-Slop-Kunst, sondern handgemachte Assets in einem strukturierten, nachvollziehbaren Prozess.

---

## Vorbereitung (vor dem Termin)

1. **Artwork ablegen:** die fertig gemalten PNGs nach `public/demo/dungeon/` kopieren (Dateinamen und Größen: `public/demo/dungeon/README.md`).
2. `npm install`, dann `npm run build` und `npm run preview` → Browser auf `http://localhost:4173`.
3. Chrome/Edge, **ein** Fenster, Zoom 100 %, Sprache **DE**.
4. **Zahnrad (Projekteinstellungen) → „Demo zurücksetzen“** → bestätigen.
5. Kurz prüfen: Im Szenen-Board steht **8 / 11**, und es ist **kein gelber „PLATZHALTER“** mehr zu sehen. Sonst fehlt eine PNG.
6. Für Schritt 5 `presentation/demo-blueprint.json` in einem Editor offen haben (Inhalt kopieren).

Ausgangszustand nach dem Zurücksetzen:

| Gruppe | Zustand |
| --- | --- |
| Dungeon-Crawler — Eingangshalle | 8 Assets fertig, **Schatztruhe** wartet auf Review (mit Notiz), **Fackelflamme** in Arbeit (wird live gemalt), Staubpartikel offen |
| Player – Ritter (3D) | 7 Körperteil-Tickets, alle offen |

Die App öffnet direkt das Ticket **Fackelflamme**.

---

## Ablauf (Klick für Klick)

### 0. Einstieg (ca. 30 s): das Problem
**Sagen:** „Spiele und Software werden künftig stark von KI gebaut — aber KI-Kunst will niemand: der AI-Slop-Look zerstört die Art Direction. Die Idee: Die KI schreibt den Code und **sagt uns, welche Assets fehlen**, und Menschen malen sie von Hand. Genau diesen Übergang zeigt dieses Tool.“

### 1. Das Ziel: die Szene (ca. 1 Min)
- Oben auf **„Szene“**.
- Zeigen: die Eingangshalle, zusammengesetzt aus den fertigen Assets, Fortschritt **8 / 11**, rechts die Asset-Slots mit Status.

**Sagen:** „Das ist ein Raum aus einem Dungeon-Spiel. Die KI hat ihn geplant und in 11 einzelne Mal-Aufträge zerlegt. Acht davon sind schon von Hand gemalt und sitzen an ihrem Platz.“

### 2. Ein Ticket von der KI (ca. 1 Min)
- Oben auf **„Arbeitsfläche“** → das Ticket **Fackelflamme** ist offen.
- Zeigen: Brief, Maße (128 × 128), **„Fertig, wenn …“** und **Priorität hoch**.

**Sagen:** „Jedes Ticket ist ein präziser Auftrag: was, wie groß, in welchem Stil — und woran man erkennt, dass es fertig ist. Das schreibt die KI.“

### 3. Live malen (ca. 1,5 Min)
- Orange/Gelb wählen, mit dem Pinsel eine Flamme malen (30 Sekunden reichen), **Strg+Z** zeigen.
- **„Als fertig markieren“** → oben auf **„Szene“**: Die Flamme sitzt jetzt auf der Fackel-Halterung, **9 / 11**.

**Sagen:** „Gemalt wird von Hand. Sobald das Ticket fertig ist, landet das Asset automatisch an seinem Platz in der Szene.“

### 4. Review (ca. 45 s)
- In der Queue **Schatztruhe** öffnen (Status **„Review bereit“**).
- Unten die **Notiz** vom Art Director zeigen.
- **„Als fertig markieren“** → Szene: **10 / 11**.

**Sagen:** „Nichts geht ungeprüft durch. Feedback hängt direkt am Ticket, und erst die Freigabe durch einen Menschen macht ein Asset fertig.“

### 5. Ein neuer Plan von der KI (ca. 1 Min)
- **„Von KI einfügen“** (Bot-Icon oben).
- Links den fertigen **Prompt** zeigen („den bekommt die KI“), rechts den Inhalt von `presentation/demo-blueprint.json` einfügen → **„Tickets erstellen“**.
- Ergebnis: neue Gruppe **Schatzkammer** mit 3 Tickets, jeweils mit Brief und „Fertig, wenn …“.

**Sagen:** „Die KI liefert keine Pixel, sondern einen **strukturierten Plan (JSON)**. Das Tool prüft ihn und erzeugt daraus die Tickets. Schickt die KI denselben Plan noch einmal, werden die Tickets aktualisiert, nicht verdoppelt — die gemalte Arbeit bleibt erhalten.“

### 6. Dasselbe Prinzip in 3D (ca. 1,5 Min)
- Links die Gruppe **Player – Ritter** anklicken → Modell-Board mit 7 Körperteil-Tickets.
- **HEAD** öffnen. Über dem Canvas **„3D-Modell“** wählen und direkt auf dem Kopf malen.
- Optional: auf ein anderes Körperteil klicken → dessen Ticket öffnet sich.

**Sagen:** „Für 3D zerlegt die KI ein Modell in bemalbare Teile, jedes mit eigenem Ticket und allen Material-Kanälen. Der Artist malt direkt am Modell und sieht sofort das Ergebnis.“

### 7. Externer Workflow (ca. 30 s)
- In einem Ticket rechts **„Extern malen“** zeigen: **PSD-Vorlage**, **Fertig hochladen**.

**Sagen:** „Wer lieber in Photoshop arbeitet: Vorlage mit den exakten Maßen herunterladen, fertig malen, hochladen. Das Asset landet dann im Review.“

### 8. Der Handoff an die KI / DAM (ca. 1 Min): der Business-Punkt
- Oben rechts das **Download-Icon** („Projekt-Zustand exportieren (KI)“).
- Kurz die JSON zeigen: Tickets, Status, Notizen, **Thumbnails**.

**Sagen:** „Das ist der Übergabepunkt. Im Zielbild setzt die App beim Fertigstellen den **Status in der DAM**, und die KI, die den Code schreibt, arbeitet mit den fertigen Assets weiter. Ein Asset ist noch offen — so sieht laufende Produktion aus.“

---

## Fallbacks

- **Hängt / falscher Zustand:** Zahnrad → „Demo zurücksetzen“ (dauert eine Sekunde, braucht kein Internet).
- **3D-Vorschau bleibt schwarz:** WebGL nötig; Browser neu starten. Im Notfall Schritt 6 überspringen.
- **Gelber PLATZHALTER sichtbar:** Eine PNG fehlt in `public/demo/dungeon/`, danach neu bauen und zurücksetzen.

---

## Q&A-Vorbereitung

- **„Ist das KI-generierte Kunst?“** Nein. Die KI plant, brieft und prüft. **Gemalt wird von Hand.** Kein Modell erzeugt hier Bilder.
- **„Was macht die KI konkret?“** Sie leitet aus dem Spiel ab, welche Assets eine Szene oder ein Modell braucht, und erzeugt daraus Tickets mit Brief, Maßen und Abnahmekriterien.
- **„Wo landen die Assets?“** Im Zielbild in der DAM. Im Prototyp zeigt das der Status-Export mit Thumbnails.
- **„Wie weit ist das?“** Ein Prototyp, komplett im Browser, ohne Backend. Er validiert genau diese Schleife. Nächste Schritte: Backend/SSO, Mehrbenutzer, DAM-Anbindung.
- **„Was bringt das dem Geschäft?“** Struktur und Nachvollziehbarkeit in kreativer Produktion, ohne Künstler zu ersetzen — und ein sauberer Weg, wie KI-generierter Code und handgemachte Assets zusammenkommen.

---

## Technische Randnotizen (für Rückfragen)

- React + Three.js + ag-psd, Daten lokal in IndexedDB.
- `npm run build`, `npm test`, `npm run lint`.
- Demo-Inhalt: `src/data/demo.ts` (Status pro Asset), `src/data/dungeonScene.ts` (KI-Plan der Szene), `src/data/modelDemo.ts` (Ritter-Modell).
