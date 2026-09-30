import type { SceneBlueprint } from '../types';

/**
 * Vom „KI-Produktionsassistenten“ verfasste Aufschlüsselung einer kleinen Szene:
 * die Eingangshalle eines Dungeon-Crawlers. Jeder Eintrag ist eine echte
 * Art-Anforderung mit Abmessungen, Mal-Briefing und Platz in der Szenenkomposition.
 */
export const DUNGEON_ENTRANCE_BLUEPRINT: SceneBlueprint = {
  name: 'Dungeon-Crawler — Eingangshalle',
  description:
    'Der erste Raum, den der Spieler betritt: eine feuchte Steinhalle mit einer eisenbeschlagenen Tür, die tiefer in die Festung führt. Fackelbeleuchtet, ruhig, ein wenig bedrohlich.',
  artDirection:
    'Handgemalt im Stil eines PC-Dungeon-Crawlers der späten 90er. Kaltes Schiefer- und Blaugrau, Moos in den Fugen, warmes bernsteinfarbenes Fackellicht, das durch tiefen Schatten schneidet. Etwas raue, malerische Kanten mit sichtbarer Pinselrichtung. Nicht fotorealistisch, niemals zu sauber.',
  canvas: { width: 960, height: 540, background: '#0b0d12' },
  assets: [
    {
      title: 'Steinwand-Blöcke (nahtlos)',
      type: 'texture',
      dimensions: { width: 512, height: 512 },
      background: 'white',
      brief:
        'Nahtlos kachelbare Textur feuchter Steinblöcke. Große, unregelmäßige Blöcke mit abgeplatzten Ecken, dunkler Mörtel, ein paar moosige Stellen in der unteren Hälfte. Kalte blaugraue Basis (ca. #5b6573), die dunkel bleibt, damit das Fackellicht darauf wirkt. Die Kanten müssen an allen vier Seiten sauber kacheln.',
      layout: { x: 0, y: 0, width: 960, height: 330, layer: 0 },
    },
    {
      title: 'Bodenplatten (nahtlos)',
      type: 'texture',
      dimensions: { width: 512, height: 512 },
      background: 'white',
      brief:
        'Nahtloser, abgenutzter Bodenstein, etwas heller und wärmer als die Wände. Große Platten mit feinen Rissen, eingetretenem Schmutz und ein paar moosigen Fugen. Dezentes Licht von oben, damit Requisiten darauf liegen können. Muss nahtlos kacheln.',
      layout: { x: 0, y: 330, width: 960, height: 210, layer: 1 },
    },
    {
      title: 'Eisenbeschlagene Türöffnung',
      type: 'prop',
      dimensions: { width: 256, height: 384 },
      background: 'transparent',
      brief:
        'Ein zurückgesetzter Steinbogen, der eine schwere, mit Bändern und Eisennieten beschlagene Holztür mit Ringgriff rahmt. Der Bogen soll dunkler als die Wand sein, damit er eingesetzt wirkt. Transparenter Hintergrund; weicher Kontaktschatten unter der Tür.',
      layout: { x: 384, y: 84, width: 192, height: 276, layer: 2 },
    },
    {
      title: 'Hängendes Banner',
      type: 'prop',
      dimensions: { width: 160, height: 320 },
      background: 'transparent',
      brief:
        'Ein abgenutztes Stoffbanner an einem Holzstab. Verblasstes Dunkelrot mit einfachem hellem Sigill, ausgefranste Unterkante, ein Riss an der Seite. Schwere vertikale Falten, warm von der Fackelseite beleuchtet. Transparenter Hintergrund.',
      layout: { x: 150, y: 48, width: 140, height: 280, layer: 3 },
    },
    {
      title: 'Wandfackel-Halterung',
      type: 'prop',
      dimensions: { width: 128, height: 192 },
      background: 'transparent',
      brief:
        'Eine geschwärzte Eisen-Wandhalterung mit unangezündeter Fackel, von vorn gesehen. Wachsklumpen und freiliegender Docht oben. Kühles Kantenlicht von der Raumseite, warmer Reflex von unten. Transparenter Hintergrund.',
      layout: { x: 96, y: 150, width: 96, height: 160, layer: 4 },
    },
    {
      title: 'Fackelflamme',
      type: 'effect',
      dimensions: { width: 128, height: 128 },
      background: 'transparent',
      brief:
        'Eine einzelne stilisierte Fackelflamme, gemalt als additive Glut: weißglühender Kern, bernsteinfarbener Körper, weicher rot-oranger Saum, dünner Rauchfaden. Soll direkt über der Halterung sitzen. Rein transparenter Hintergrund, damit sie additiv gelegt werden kann.',
      layout: { x: 112, y: 130, width: 64, height: 88, layer: 5 },
    },
    {
      title: 'Holzfass',
      type: 'prop',
      dimensions: { width: 160, height: 192 },
      background: 'transparent',
      brief:
        'Ein Eichenfass mit zwei verrosteten Eisenreifen, leicht verzogenen Dauben und dunklem Deckel. Warmes Braun, kühles Kantenlicht aus dem Raum, ein kleines Stück fehlt an einem Reifen. Transparenter Hintergrund mit weichem elliptischem Kontaktschatten.',
      layout: { x: 770, y: 308, width: 134, height: 162, layer: 6 },
    },
    {
      title: 'Holzkiste',
      type: 'prop',
      dimensions: { width: 160, height: 160 },
      background: 'transparent',
      brief:
        'Eine grobe, vernagelte Plankenkiste, Ecken mit Eisen verstärkt. Eine Planke sitzt leicht offen. Gleiche Eichenpalette wie das Fass, damit sie als Set wirken. Transparenter Hintergrund mit weichem Kontaktschatten.',
      layout: { x: 616, y: 332, width: 150, height: 150, layer: 7 },
    },
    {
      title: 'Schatztruhe',
      type: 'prop',
      dimensions: { width: 224, height: 160 },
      background: 'transparent',
      brief:
        'Eine geschlossene Schatztruhe: dunkler Eichenkörper, gewölbter Deckel mit Eisenbändern und zentralem Schlossblech mit Schlüsselloch. Ein Hauch goldenes Licht dringt aus dem Deckelspalt, um zu verlocken. Transparenter Hintergrund mit Kontaktschatten.',
      layout: { x: 296, y: 338, width: 214, height: 150, layer: 8 },
    },
    {
      title: 'Eck-Spinnennetz',
      type: 'prop',
      dimensions: { width: 192, height: 192 },
      background: 'transparent',
      brief:
        'Ein staubiges Spinnennetz für eine Deckenecke: feine grau-weiße Fäden, die von einer Ecke ausgehen, dichter am Ankerpunkt, herabhängende, gerissene Fäden. Für die obere linke Ecke gezeichnet. Transparenter Hintergrund, insgesamt niedrige Deckkraft.',
      layout: { x: 16, y: 16, width: 180, height: 180, layer: 9 },
    },
    {
      title: 'Staubpartikel & Lichtnebel',
      type: 'effect',
      dimensions: { width: 512, height: 512 },
      background: 'transparent',
      brief:
        'Ein bildfüllendes Atmosphären-Overlay: ein weicher diagonaler Lichtkegel von rechts oben, gefüllt mit schwebenden Staubpartikeln, plus dezente Vignette, die die Ecken abdunkelt. Größtenteils transparent mit sanftem Nebel. Gemalt, um über dem ganzen Raum zu liegen.',
      layout: { x: 0, y: 0, width: 960, height: 540, layer: 10 },
    },
  ],
};
