# AI bridge

The AI bridge closes the loop from [`VISION.md`](./VISION.md): an AI agent plans the work and requests it from humans, a creative director approves ideas and results, and artists make every asset in the studio.

```
Director ──idea──▶ AI ──concept──▶ Director ──OK──▶ AI ──tickets──▶ Studio ──▶ Artist
    ▲                 ◀─DECLINED─┘                                              │
    │                                                                           ▼
 ACCEPTED ◀── Director ◀──result── AI ◀──"assets delivered"── Studio ◀──artwork─┘
 (scene done)    └─DECLINED + rework notes ──▶ tickets reopen for the artist
```

## How it fits together

- **Bridge server** (`npm run bridge`, `server/`): a small local Node server. It is the shared mailbox between the AI and the studio. It stores concepts, productions (AI blueprints), per-asset delivery state and the delivered PNGs in `.studio-bridge/`.
- **MCP endpoint** (`http://127.0.0.1:4317/mcp`): the tools the AI calls. Stateless Streamable HTTP.
- **Studio** (the web app): the artist's workspace, unchanged and still fully local (IndexedDB). It syncs with the bridge every 2 s while the bridge is running:
  - new or revised AI blueprints become tickets (without stealing focus from the canvas);
  - AI messages appear as ticket notes;
  - ticket status, notes and finished artwork flow back to the bridge.
- **Director view** (the *Director* tab): write ideas for the AI, approve or decline concepts, and accept or decline finished productions. A decline can mark individual assets for rework, with a note; those tickets reopen with the note attached.

The studio works exactly as before when the bridge isn't running; the Director tab then shows how to start it.

## Setup

```bash
npm install
npm run bridge   # terminal 1 — AI bridge on http://127.0.0.1:4317
npm run dev      # terminal 2 — studio on http://localhost:3000
```

Connect an agent to the MCP endpoint, for example Claude Code:

```bash
claude mcp add --transport http creative-collab http://127.0.0.1:4317/mcp
```

Clients that only speak stdio can go through a proxy such as `npx mcp-remote http://127.0.0.1:4317/mcp`.

Then tell the agent something like: *"You're the production manager in Creative Collab Studio. Check studio_status and run the loop."* The server's MCP instructions and the `studio_status` tool explain the workflow to the agent.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `STUDIO_BRIDGE_PORT` | `4317` | Port of the bridge |
| `STUDIO_BRIDGE_HOST` | `127.0.0.1` | Interface to bind |
| `STUDIO_BRIDGE_DATA` | `.studio-bridge` | Where state and delivered PNGs are stored |
| `STUDIO_BRIDGE_ALLOWED_ORIGINS` | — | Extra comma-separated browser origins allowed to call the API (localhost is always allowed) |
| `VITE_BRIDGE_URL` | `http://127.0.0.1:4317` | Where the studio looks for the bridge |

The bridge is meant for a single machine: it only answers requests whose `Host` is localhost, and browser requests only from localhost origins (plus any you allow). That protects it from DNS rebinding and from other websites.

## MCP tools

| Tool | Loop step | What it does |
|---|---|---|
| `studio_status` | — | Every concept and production, what is waiting on the AI, the current event cursor, and the workflow guide. |
| `submit_concept` | 2 | Present a concept draft to the director. Pass `conceptId` to answer a director's idea or revise a declined concept. |
| `get_concept` | 2 | A concept with its drafts, decisions and feedback. |
| `get_blueprint_format` | 3 | The blueprint JSON format and rules (the same ones as the copy-paste prompt). |
| `submit_production` | 3 | Turn an **approved** concept into ticket requests. Re-submitting the same blueprint id revises it and keeps painted work. |
| `get_production` | 4–6 | Phase, per-asset status, delivered versions, artist notes, review history. |
| `message_artist` | 4–5 | Post a note on one ticket, for example to answer an artist's question. |
| `get_asset_image` | 6 | The delivered artwork of one asset, as an image. |
| `get_scene_composite` | 6 | The assembled 2D scene, as an image. |
| `submit_for_review` | 7 | Present a fully delivered production to the director. |
| `wait_for_updates` | 6, 8 | Block until something happens, then return the events. Pass the returned cursor back each time. |

### Events (`wait_for_updates`)

`idea-created`, `concept-submitted`, `concept-approved`, `concept-declined`, `production-submitted`, `production-imported`, `asset-status`, `asset-delivered`, `artist-note`, `production-delivered`, `review-submitted`, `review-accepted`, `review-declined`.

`wait_for_updates` waits 45 s by default (up to 300 s) and sends MCP progress notifications every 10 s when the client asks for them. An empty result just means "nothing yet — call again".

## Lifecycle

**Concept:** `idea` (the director wrote it) → `awaiting-director` → `approved` | `declined` → (AI revises) → `awaiting-director` …

**Production:** `awaiting-import` → `in-production` → `delivered` → `in-review` → `accepted`, or `in-review` → `changes-requested` → `delivered` (once the reworked assets are delivered again) → `in-review` …

The gates are enforced on the server: the AI cannot create tickets for a concept the director hasn't approved, cannot present a production until every asset is delivered, and a decline always carries feedback or at least one asset to rework.

"Delivered" means the ticket is **complete** in the studio and its artwork has been uploaded. Archived tickets don't count towards delivery.

## Studio API (used by the web app)

| Method | Path | |
|---|---|---|
| `GET` | `/api/health` | |
| `GET` | `/api/state?since=<version>` | Full snapshot, or `{ unchanged: true }` if nothing changed |
| `POST` | `/api/ideas` | Director writes an idea |
| `POST` | `/api/concepts/:id/decision` | Approve / decline a concept |
| `POST` | `/api/productions/:id/imported` | The studio created the tickets (sends the asset roster) |
| `POST` | `/api/productions/:id/assets/:assetId/sync` | Status, version and notes of one asset |
| `PUT` / `GET` | `/api/productions/:id/assets/:assetId/image` | Delivered artwork (PNG) |
| `PUT` / `GET` | `/api/productions/:id/composite` | Assembled scene (PNG) |
| `POST` | `/api/productions/:id/review-decision` | Accept / decline with rework |
| `POST` | `/api/replies/:id/ack` | An AI message is now a ticket note |

Shared types live in `src/bridge/protocol.ts`.

## Limits and next steps

- **One director, one machine.** There are no user accounts. Whoever opens the Director tab is the director.
- **Model productions** deliver each part's BaseColor canvas. Other material channels aren't uploaded yet, and model productions have no scene composite.
- **The studio must be open** for tickets to be created and artwork to be delivered, because the tickets live in the browser.
- **New productions go into the studio's active project.** Later revisions stay in the project that holds the scene.
- **Archive a requested ticket instead of deleting it.** The bridge stops waiting on archived tickets, but it keeps waiting on a deleted one until the AI submits a revised blueprint without it.
