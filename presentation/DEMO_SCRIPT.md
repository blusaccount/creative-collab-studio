# Demo-Skript — Creative Collab Studio

Zielgruppe: Boss / Business. Dauer: ca. 6–8 Minuten. Fokus: **KI orchestriert, der Mensch malt, Assets fließen zurück in die KI/DAM.**

---

## Kernbotschaft (roter Faden)

> KI schreibt den Code und erkennt, welche Assets eine Szene, Animation oder ein Modell braucht.
> Sie stellt die Anforderungen als strukturierte **Tickets** an menschliche Artists.
> Der Mensch malt jedes Asset von Hand — im Tool oder in Photoshop.
> Sobald das Ticket fertig ist, geht das Asset **zurück an die KI / in die DAM**.
> Ergebnis: keine AI-Slop-Kunst, sondern handgemachte Assets in einem strukturierten, nachvollziehbaren Prozess.

---

## Vorbereitung (vor dem Termin)

1. `npm install`
2. `npm run build`
3. `npm run preview` (Produktionsbuild — stabiler als dev) → Browser auf `http://localhost:4173`
   - Alternative für die Entwicklung: `npm run dev` → `http://localhost:3000`
4. Browser: Chrome/Edge, **ein** Fenster, Zoom 100 %, alle anderen Tabs/Bookmarks schließen.
5. Sauberer Startzustand: **Zahnrad oben** → **„Demo zurücksetzen"** → bestätigen.
   Danach: ein Projekt + die 2D-Szene „Eingangshalle". Sprache ist **DE**.
6. Sicherheitsnetz: Bei jedem Hänger **Zahnrad → „Demo zurücksetzen"**. Es braucht kein Internet (alles lokal).

---

## Ablauf (Klick für Klick)

### 0. Einstieg (ca. 30 s) — das Problem
Auf dem Bildschirm: die Gruppenliste links, die Ticket-Queue, der Editor.
**Sagen:** „Spiele und Software werden künftig stark von KI gebaut — aber KI-Kunst will niemand: der AI-Slop-Look zerstört die Art Direction. Die Idee: die KI schreibt den Code und **sagt uns, welche Assets fehlen**, und Menschen malen sie von Hand. Genau diesen Übergang zeigt dieses Tool."

### 1. Handgemalt im Browser (ca. 1,5 Min)
- Ticket in der Queue anklicken (z. B. ein Asset der „Eingangshalle") → Editor öffnet sich.
- Kurz malen: Brush, Farbe, Größe, **Ebenen**-Panel rechts, **Rückgängig** (Strg+Z).
**Sagen:** „Jedes Asset ist ein eigenes Ticket mit Brief, Größe und Zweck. Gemalt wird von Hand — hier im Browser."

### 2. Der KI-Vertrag (ca. 1 Min)
- Oben in der Topbar: **Bot-Icon** („Von KI einfügen") anklicken.
- Zeigen: links der **fertige Prompt**, rechts das Einfüge-Feld.
**Sagen:** „Die KI liefert keinen Pixel-Output, sondern einen **strukturierten Plan (JSON)** — pro Asset Titel, Typ, Maße, Brief und Ziel. Das Tool validiert den Plan und erzeugt daraus automatisch die Tickets. So weiß die KI genau, was der Mensch produzieren soll."

### 3. Das 3D-Texturset (ca. 1,5 Min)
- Links in der Gruppenliste oben: **Pinsel-Icon** („Bemaltes Beispiel laden").
- Der **Modell-Board** öffnet sich: Textur-Maps pro Körperteil, **Live-3D-Vorschau**.
**Sagen:** „Dasselbe Prinzip für 3D: Die KI zerlegt ein Modell in bemalbare Teile mit eigenem Ticket — BaseColor, Normal, Roughness und so weiter."

### 4. Auf dem Modell malen (ca. 1 Min)
- Ein Teil-Ticket öffnen → rechts die **3D-Vorschau**.
- Im Editor oben **„3D-Modell"** wählen und direkt auf dem Modell malen.
**Sagen:** „Der Artist arbeitet direkt am Modell oder auf der UV-Fläche — und sieht sofort das Ergebnis. Kein Blindflug zwischen Tools."

### 5. Externer Workflow (ca. 1 Min)
- Im Editor rechts den Abschnitt **„Extern malen"** zeigen: **PSD-Vorlage**, **Fertig hochladen**.
**Sagen:** „Wer lieber in Photoshop arbeitet: Vorlage mit den exakten Maßen herunterladen, fertig malen, zurück hochladen — das Ticket springt automatisch auf „fertig". Der Mensch bleibt in seiner gewohnten Software."

### 6. Review & Zusammenbau (ca. 1 Min)
- In der Queue den **Status** eines Tickets ändern (z. B. auf „fertig").
- Oben auf **„Szene"** wechseln: Fortschrittsbalken, Slots, **„Szene exportieren"**.
**Sagen:** „Fertige Assets werden automatisch in die Szene gesetzt und als Ganzes exportiert — mit Review-Status und Kommentaren pro Ticket."

### 7. Der Handoff an die KI / DAM (ca. 1 Min) — der Business-Punkt
- Oben rechts das **Download-Icon** („Projekt-Zustand exportieren (KI)") anklicken.
- Kurz die JSON zeigen (Tickets, Status, **Thumbnails**).
**Sagen:** „Das ist der Übergabepunkt: Im Zielbild setzt die App beim Fertigstellen den **Status im DAM**. Die KI, die den Code schreibt, **beobachtet die DAM** und arbeitet mit den fertigen Assets weiter. Der Status in der DAM — nicht ein Bild an die KI — ist die Schnittstelle zwischen menschlicher Produktion und KI."

---

## Fallbacks

- **Hängt / leer / falscher Zustand:** Zahnrad → „Demo zurücksetzen".
- **3D-Vorschau bleibt schwarz:** anderes Browserfenster/Tab oder Neustart; WebGL nötig. Im Notfall Schritt 3–4 überspringen (2D und Handoff reichen für die Story).
- **Kein Netz nötig** — alles läuft lokal im Browser.

---

## Q&A-Vorbereitung

- **„Ist das AI-generierte Kunst?"** Nein. Die KI plant, brieft und prüft. **Gemalt wird von Hand.** Kein Modell erzeugt hier Bilder.
- **„Was macht die KI konkret?"** Sie schreibt/strukturiert den Code und leitet ab, welche Assets eine Szene/Animation/ein Modell braucht — und vergibt daraus Tickets.
- **„Wo landen die Assets?"** Im DAM. Im Prototyp ist das als **Status-/State-Export mit Thumbnails** demonstriert; produktiv wird daraus der DAM-Status.
- **„Wie weit ist das?"** Ein **vibe-codierter Prototyp** (browser-lokal, ohne Backend), der genau diese Schleife validiert. Build ist installierbar; ein Backend/SSO und die DAM-Integration sind die nächsten Schritte.
- **„Was bringt das dem Geschäft?"** Struktur und Nachvollziehbarkeit in kreativer Produktion, ohne Künstler zu ersetzen — und ein sauberer Weg, wie KI-generierter Code und handgemachte Assets zusammenkommen.

---

## Technische Randnotizen (für Rückfragen)

- Läuft komplett im Browser (React + Three.js + ag-psd), lokale Daten in IndexedDB.
- Build: `npm run build`, Tests: `npm run test`, Lint: `npm run lint`.
- Beispiel-Assets: 2D-Dungeon-Szene + 3D-„Ritter"-Set (PBR-Maps) sind eingebaut.
