# Creative Collab Studio

A collaborative creative workspace where AI agents and human artists work together on stylized game art.

## Overview

Creative Collab Studio is a ticket-driven asset pipeline for game creation. AI agents can identify missing textures, props, UI art, or concept work and create a well-structured request. A human artist then opens that request in a purpose-built canvas workspace, paints or edits the required asset, and sends it back into the project pipeline.

This is designed for highly stylized work, especially hand-drawn or nostalgic game aesthetics.

## Core idea

Instead of a generic art tool, this product fits directly into a game development workflow:

- AI detects what the game needs
- AI creates a clear ticket with description, dimensions, style references, and constraints
- The artist sees the queue on the left
- The selected ticket opens in the right-side drawing workspace
- The artist paints or edits the requested asset
- A green check confirms completion and pushes the result back into the project

## Why this matters

A lot of art tooling is optimized for freeform creativity, but game production needs workflow, structure, and fast iteration. This tool gives you both:

- structure for AI-driven tasking
- freedom for human-crafted artistic direction

This is especially powerful for projects with a strong aesthetic identity, such as:

- nostalgic room scenes
- retro console visuals
- hand-drawn surreal environments
- stylized UI and menus
- procedurally scaffolded object art

## Product vision

Creative Collab Studio helps teams build immersive, stylized game worlds by making the handoff between AI and artist feel like a tight creative loop rather than a file dump.

The goal is to support a workflow where:

- AI acts as a production assistant
- humans remain the final artistic authority
- assets move quickly from request to iteration to completion

## Example workflow

1. AI notices the scene needs a GameCube controller texture for a shelf prop.
2. AI creates a ticket: `controller-body-texture`.
3. The artist selects the ticket from the left panel.
4. The right panel opens a drawing workspace with the dimensions and required design brief.
5. The artist paints the texture, uses reference images, and hits the green completion button.
6. The asset is saved and returned to the game project.

## MVP scope

### Must have

- Ticket queue on the left
- Selected ticket opens in the drawing area on the right
- Simple brush, eraser, color picker, clear, undo, and redo
- Canvas-based drawing workspace
- Save/export asset and send back to the project
- Ticket metadata: title, description, dimensions, status

### Nice to have

- Layer support
- Reference image overlay
- Zoom and pan controls
- Soft paper textures and hand-drawn brush presets
- AI-generated ticket templates
- Asset history and review annotations

## Repository structure

The app is a fully client-side workspace with no backend. Projects and tickets are persisted in IndexedDB.

- `src/App.tsx` — app shell, routing between workspace and asset library
- `src/types.ts` — domain types (projects, tickets, layers, notes, settings)
- `src/state/useStudio.ts` — studio state + persistence orchestration
- `src/storage/` — IndexedDB wrapper and repository (bootstrap, load, save)
- `src/drawing/DrawingEngine.ts` — layered canvas engine (tools, history, render, export)
- `src/drawing/compose.ts` — offscreen compositing for library thumbnails and batch export
- `src/components/` — queue, editor, toolbar, layers, notes, dialogs, asset library
- `src/data/seed.ts` — first-run example project and tickets
- `src/styles.css` — dark/light theming and layout

## Capabilities

- Persistent projects and tickets (IndexedDB), auto-saved canvas state
- Real drawing engine: hard / soft / textured brushes, eraser, bucket fill, eyedropper, opacity
- Multi-layer workflow with visibility, opacity, locking, reorder + reference layers
- Zoom / pan, pixel grid overlay, reference images via upload or paste
- Non-destructive history (undo/redo), clear with confirmation, revert to last saved
- Ticket workflow: statuses, notes/review comments, filters, sorting, drag-and-drop reorder
- Asset export: transparent PNG, versioned file naming, batch export to an organized folder tree (File System Access API with download fallback)

## Development

```bash
npm install
npm run dev
```

## Scripts

```bash
npm run dev
npm run build
npm run preview
```

## Roadmap

### Phase 1: Workspace proof of concept

- ticket list
- selected ticket detail
- drawing canvas
- save/export flow
- mock dataset

### Phase 2: Real ticket pipeline

- persistent tickets
- local file storage
- AI-generated request templates
- better art tool controls

### Phase 3: Asset integration

- connect output back to project folder
- versioning and history
- thumbnails and references
- cross-project asset library

### Phase 4: Collaboration system

- comments/notes
- review history
- multi-user workflows
- AI critiques and revisions

## Future direction

This project could become a creative operating system for stylized game development, where human artistry and AI tasking work in the same loop.

It is especially well-suited for:

- nostalgic game aesthetics
- hand-drawn 3D props and textures
- surreal environment styling
- asset-heavy art direction work
- iterative AI-assisted art production

## License

MIT
