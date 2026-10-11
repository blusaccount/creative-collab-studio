# Handoff log

What changed recently, how it was checked and what is still open. Read the newest entry before you start; add yours at the top when you finish.

- Newest entry first, one entry per session or pull request.
- Keep the ten newest entries. When you add the eleventh, delete the oldest: `git log -p HANDOFF.md` has the rest.
- Four headings per entry: **Asked** (the request, in the user's words), **Changed**, **Verified** (what was actually run or looked at, with its result), **Not verified / open**.

---

# Handoff: agent docs, launch config, test isolation (2026-10-12)

Branch `claude/stricthotelweb-tools-review-324587`, cut from `90ac165`.

## Asked

Which tools and workflows of the maintainer's other project (`stricthotelweb`) are useful here, then: "leg die sechs Dinge an" (`CLAUDE.md`, `launch.json`, `PLANS.md`, `HANDOFF.md`, the Vitest exclude, the isolation test).

## Changed

- `CLAUDE.md` (new): the one instruction file. `AGENTS.md` (new) points to it.
- `.claude/launch.json` (new): `studio` and `bridge`. The studio takes another port when 3000 is in use; the bridge stays on 4317 because the studio looks for it there.
- `PLANS.md` (new): the ExecPlan template. Context is split into what exists, what stands against it and what was not read.
- `HANDOFF.md` (new): this file.
- `vite.config.ts`: Vitest excludes `**/.claude/**`; the dev port is `PORT` when set, else 3000. The import moved to `vitest/config` for the `test` key.
- `server/isolation.test.ts` (new): no UI layer, `.tsx` or package in the `src/` modules the server loads; no `server/` or `node:` import in the web app.

## Verified

- `npm test`: 9 files, 57 tests pass (8 files, 53 tests before). `npm run typecheck`: exit 0. `npm run lint`: 0 errors, the 7 warnings that were there before. `npm run build`: ok.
- Each isolation test fails on its violation and the files were restored after: `three` imported in `src/scenes/maps.ts`, a component re-exported from `src/scenes/build.ts`, `server/store` and `node:fs` imported in `src/utils/color.ts`. A type-only import of a component passes, as intended.
- Vitest exclude: with a test file under `.claude/worktrees/probe/`, `npx vitest list --filesOnly` lists it under the old config and not under the new one. Before the change the main checkout listed 16 files, 8 of them this worktree's copies.
- `launch.json`: both entries started from the Browser pane. Port 3000 was held by another project's dev server, the studio came up on an assigned port and its Director tab showed the bridge as connected; `/api/health` answered.
- `npm run typecheck` already rejects a DOM global in a module the server imports (`document` in `src/bridge/protocol.ts`: TS2584 from `tsconfig.server.json`). It does not reject a browser package there; that is the isolation test's part.

## Not verified / open

- The main checkout has uncommitted changes in 13 files on `main` (among them `server/store.ts`, `server/mcp.ts`, `src/components/DirectorView.tsx`). They were not read. `CLAUDE.md` describes commit `90ac165`.
- The Vitest exclude reaches the main checkout only after a merge and one `npm run typecheck` there: a generated `vite.config.js` shadows `vite.config.ts` (see `CLAUDE.md`). Not changed here: `tsconfig.node.json` could stop emitting it.
- Found while reading, not changed:
  - Scene layout slots are not checked against the canvas (`src/scenes/build.ts`, `validateBlueprintReport` only rounds them), and `submit_production` has no dry run: the tickets reach the artist's queue on the next sync.
  - The AI never sees a model: only BaseColor per part is uploaded and model productions have no composite (`src/bridge/sync.ts`, `planOutbox`).
  - The bridge accepts any PNG as a delivery (`server/store.ts`, `deliverAsset`). The artist can resize a ticket (`src/components/TicketSettingsDialog.tsx`), so a delivery can differ from the blueprint's dimensions unnoticed.
  - Artist notes reach the agent verbatim (`server/store.ts`, `syncAsset`); the workflow guide in `server/mcp.ts` does not say they are data.
  - `docs/VISION.md` says stroke history is recorded; the code has an in-memory undo stack (`src/drawing/DrawingEngine.ts`).
  - `submit_concept` says "Markdown is fine"; the Director view prints the draft as plain text (`src/components/DirectorView.tsx`, `.director-draft`).
  - The studio has no debug handle for a scripted browser session (no `window.__` in `src/`).
