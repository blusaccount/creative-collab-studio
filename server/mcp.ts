import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { BLUEPRINT_RULES_EN, MODEL_SCHEMA, SCENE_SCHEMA } from '../src/scenes/aiPrompt';
import { deliveredCount, requiredAssets, type BridgeEvent, type Concept, type Production } from '../src/bridge/protocol';
import { BridgeError, type BridgeStore } from './store';

export const WORKFLOW_GUIDE = `Creative Collab Studio — AI plans, humans make.

You are the production manager. A human creative director approves ideas and results; human artists make every asset. You never generate the artwork yourself — you write precise requests, track them and present the result.

The loop:
1. The director describes an idea — either to you in chat, or as an "idea" concept in the studio's Director view (you see it in studio_status / wait_for_updates).
2. Draft a concept and present it with submit_concept (pass conceptId to answer an idea or to revise a declined concept). Then wait_for_updates until the director approves or declines. On "declined", read the feedback and submit a revised draft.
3. Once approved, break the concept into one ticket per asset: get_blueprint_format, then submit_production. The studio turns the blueprint into tickets for the artists.
4. While artists work: wait_for_updates. Answer artist questions ("artist-note" events) with message_artist. Give artists room to interpret — set constraints, don't dictate every pixel.
5. When "production-delivered" arrives, inspect the work with get_asset_image / get_scene_composite and present it with submit_for_review (an honest summary: what was asked, what was delivered, anything that deviates).
6. wait_for_updates for the director's decision. "review-accepted" = scene done. "review-declined" lists the feedback and the assets sent back for rework: the artist reworks them, and you get "production-delivered" again. If the feedback changes the plan, submit a revised blueprint with the same id (submit_production) — painted work is kept.

Always keep the cursor from wait_for_updates and pass it back, so no event is missed.`;

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function ok(summary: string, data?: unknown): CallToolResult {
  return { content: [{ type: 'text', text: data === undefined ? summary : `${summary}\n\n${json(data)}` }] };
}

function fail(error: unknown): CallToolResult {
  const message = error instanceof BridgeError || error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: 'text', text: message }] };
}

async function guarded(run: () => CallToolResult | Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    return fail(error);
  }
}

function conceptView(concept: Concept) {
  return {
    conceptId: concept.id,
    title: concept.title,
    status: concept.status,
    revision: concept.revision,
    idea: concept.idea,
    draft: concept.draft || undefined,
    directorFeedback: concept.feedback,
    history: concept.revisions.map((entry) => ({
      revision: entry.revision,
      decision: entry.decision ?? 'pending',
      feedback: entry.feedback,
    })),
  };
}

function productionView(production: Production, { full = false } = {}) {
  const required = requiredAssets(production);
  return {
    productionId: production.id,
    conceptId: production.conceptId,
    name: production.name,
    kind: production.kind,
    phase: production.phase,
    revision: production.revision,
    inStudio: production.importedRevision >= production.revision,
    progress: `${deliveredCount(production)}/${required.length} delivered`,
    warnings: production.warnings.length ? production.warnings : undefined,
    hasComposite: Boolean(production.composite),
    assets: full
      ? production.assets.map((asset) => ({
          assetId: asset.assetId,
          title: asset.title,
          status: asset.status,
          version: asset.version,
          delivered: asset.delivered ? { version: asset.delivered.version, at: new Date(asset.delivered.deliveredAt).toISOString() } : null,
          notes: asset.notes.map((note) => `${note.author}: ${note.body}`),
        }))
      : undefined,
    reviews: full
      ? production.reviews.map((round) => ({
          round: round.round,
          decision: round.decision ?? 'pending',
          feedback: round.feedback,
          rework: round.rework,
        }))
      : undefined,
  };
}

function eventView(event: BridgeEvent) {
  return {
    seq: event.seq,
    at: new Date(event.at).toISOString(),
    type: event.type,
    conceptId: event.conceptId,
    productionId: event.productionId,
    assetId: event.assetId,
    message: event.message,
  };
}

const MAX_WAIT_SECONDS = 300;
const DEFAULT_WAIT_SECONDS = 45;
const PROGRESS_INTERVAL_MS = 10_000;

/** One MCP server instance per request (stateless Streamable HTTP); all share the store. */
export function createMcpServer(store: BridgeStore): McpServer {
  const server = new McpServer(
    { name: 'creative-collab-studio', version: '0.1.0' },
    { instructions: WORKFLOW_GUIDE },
  );

  server.registerTool(
    'studio_status',
    {
      title: 'Studio status',
      description:
        'Overview of every concept and production, what is waiting on whom, and the current event cursor. Call this first. Includes the workflow guide.',
      annotations: { readOnlyHint: true },
    },
    () => {
      const snapshot = store.snapshot();
      const waitingOnYou = [
        ...snapshot.concepts
          .filter((concept) => concept.status === 'idea' || concept.status === 'declined')
          .map((concept) => `concept ${concept.id} "${concept.title}" is ${concept.status} — draft/revise it with submit_concept`),
        ...snapshot.productions
          .filter((production) => production.phase === 'delivered')
          .map((production) => `production ${production.id} "${production.name}" is delivered — present it with submit_for_review`),
      ];
      return ok(WORKFLOW_GUIDE, {
        cursor: snapshot.seq,
        waitingOnYou,
        concepts: snapshot.concepts.map(conceptView),
        productions: snapshot.productions.map((production) => productionView(production)),
      });
    },
  );

  server.registerTool(
    'get_blueprint_format',
    {
      title: 'Blueprint format',
      description: 'The JSON format and rules for submit_production blueprints (2D scenes and 3D model texture sets).',
      annotations: { readOnlyHint: true },
    },
    () =>
      ok(`Blueprint format for submit_production.

- 2D scene/environment → kind "scene" with "assets" (one ticket per asset; "layout" places it on the scene canvas).
- 3D model → kind "model" with "maps" (material channels; one ticket per paintable part when "part" is used).
- Ids: give the blueprint and each asset a stable "id". Missing ids are derived from the name/title, so keep names stable between revisions. Re-submitting a blueprint with the same "id" revises the production and keeps painted work.

2D scene:
${SCENE_SCHEMA}

3D model:
${MODEL_SCHEMA}

Rules:
${BLUEPRINT_RULES_EN}`),
  );

  server.registerTool(
    'submit_concept',
    {
      title: 'Present a concept to the director',
      description:
        'Present a concept draft to the creative director for approval (loop step 2). Omit conceptId to start a new concept; pass it to answer a director idea or to revise a declined concept. Then wait_for_updates for "concept-approved" / "concept-declined".',
      inputSchema: {
        conceptId: z.string().optional().describe('Existing concept to draft/revise. Omit for a new concept.'),
        title: z.string().optional().describe('Short title. Required for a new concept.'),
        idea: z.string().optional().describe("The director's idea as you understood it (new concepts only)."),
        draft: z
          .string()
          .describe('The concept: mood, art direction, what the scene contains and why. Markdown is fine. No asset list yet.'),
      },
    },
    (args) =>
      guarded(() => {
        const concept = store.submitConcept(args);
        return ok(
          `Concept "${concept.title}" revision ${concept.revision} is now waiting for the director. Use wait_for_updates with conceptId "${concept.id}".`,
          conceptView(concept),
        );
      }),
  );

  server.registerTool(
    'get_concept',
    {
      title: 'Get a concept',
      description: 'A concept with its idea, latest draft, status, and every decision and feedback so far.',
      inputSchema: { conceptId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ conceptId }) => guarded(() => ok(`Concept ${conceptId}:`, conceptView(store.concept(conceptId)))),
  );

  server.registerTool(
    'submit_production',
    {
      title: 'Create ticket requests',
      description:
        'Turn an APPROVED concept into ticket requests for human artists (loop step 3): a blueprint with one entry per asset. Re-submitting with the same blueprint id revises it and keeps painted work. See get_blueprint_format.',
      inputSchema: {
        conceptId: z.string().describe('The approved concept this production realises.'),
        blueprint: z
          .record(z.string(), z.unknown())
          .describe('The blueprint object (see get_blueprint_format).'),
      },
    },
    ({ conceptId, blueprint }) =>
      guarded(() => {
        const production = store.submitProduction({ conceptId, blueprint });
        return ok(
          `Production "${production.name}" (id "${production.id}") revision ${production.revision} is queued; the studio turns it into tickets when it is open. Use wait_for_updates with productionId "${production.id}" — get_production lists the asset ids once the tickets exist.` +
            (production.warnings.length ? `\nWarnings:\n- ${production.warnings.join('\n- ')}` : ''),
          productionView(production),
        );
      }),
  );

  server.registerTool(
    'get_production',
    {
      title: 'Get a production',
      description: 'Phase, per-asset status, delivered versions, artist notes and review history of one production.',
      inputSchema: { productionId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ productionId }) =>
      guarded(() => ok(`Production ${productionId}:`, productionView(store.production(productionId), { full: true }))),
  );

  server.registerTool(
    'get_asset_image',
    {
      title: 'View delivered artwork',
      description: "The artist's delivered artwork for one asset, as an image.",
      inputSchema: { productionId: z.string(), assetId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ productionId, assetId }) =>
      guarded(() => {
        const asset = store.asset(productionId, assetId);
        const png = store.readAsset(productionId, assetId);
        return {
          content: [
            { type: 'text', text: `"${asset.title}" — v${asset.delivered!.version}, status ${asset.status}.` },
            { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
          ],
        };
      }),
  );

  server.registerTool(
    'get_scene_composite',
    {
      title: 'View the assembled scene',
      description: 'The 2D scene with every completed asset placed in its layout slot, as an image.',
      inputSchema: { productionId: z.string() },
      annotations: { readOnlyHint: true },
    },
    ({ productionId }) =>
      guarded(() => {
        const production = store.production(productionId);
        const png = store.readComposite(productionId);
        return {
          content: [
            { type: 'text', text: `"${production.name}" — ${deliveredCount(production)}/${requiredAssets(production).length} assets delivered.` },
            { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
          ],
        };
      }),
  );

  server.registerTool(
    'message_artist',
    {
      title: 'Message the artist',
      description:
        'Post a note on one asset ticket for the artist — answer their question, clarify the brief. It shows up in the ticket\'s notes in the studio.',
      inputSchema: { productionId: z.string(), assetId: z.string(), message: z.string() },
    },
    ({ productionId, assetId, message }) =>
      guarded(() => {
        store.replyToArtist(productionId, assetId, message);
        return ok(`Message queued for the artist on "${store.asset(productionId, assetId).title}".`);
      }),
  );

  server.registerTool(
    'submit_for_review',
    {
      title: 'Present the result to the director',
      description:
        'Present a fully delivered production to the creative director (loop step 7). Only possible when every asset is delivered. Then wait_for_updates for "review-accepted" / "review-declined".',
      inputSchema: {
        productionId: z.string(),
        summary: z.string().describe('What was asked, what the artists delivered, and anything that deviates from the concept.'),
      },
    },
    ({ productionId, summary }) =>
      guarded(() => {
        const production = store.submitForReview(productionId, summary);
        return ok(`"${production.name}" is waiting for the director's review (round ${production.reviews.length}).`);
      }),
  );

  server.registerTool(
    'wait_for_updates',
    {
      title: 'Wait for updates',
      description:
        'Block until something happens (director decision, ticket status, delivered artwork, artist note), then return the events. Pass the returned cursor to the next call. Returns an empty list on timeout — just call again.',
      inputSchema: {
        cursor: z.number().int().min(0).optional().describe('Return events after this cursor. Omit to wait for the next new event.'),
        timeoutSeconds: z
          .number()
          .int()
          .min(0)
          .max(MAX_WAIT_SECONDS)
          .optional()
          .describe(`How long to wait (default ${DEFAULT_WAIT_SECONDS}s, max ${MAX_WAIT_SECONDS}s).`),
        conceptId: z.string().optional().describe('Only events of this concept.'),
        productionId: z.string().optional().describe('Only events of this production.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ cursor, timeoutSeconds, conceptId, productionId }, extra) =>
      guarded(async () => {
        const since = cursor ?? store.seq;
        const timeoutMs = (timeoutSeconds ?? DEFAULT_WAIT_SECONDS) * 1000;
        const progressToken = extra._meta?.progressToken;
        const started = Date.now();
        const ticker =
          progressToken !== undefined
            ? setInterval(() => {
                void extra
                  .sendNotification({
                    method: 'notifications/progress',
                    params: {
                      progressToken,
                      progress: Math.round((Date.now() - started) / 1000),
                      total: timeoutMs / 1000,
                      message: 'Waiting for the studio…',
                    },
                  })
                  .catch(() => undefined);
              }, PROGRESS_INTERVAL_MS)
            : undefined;
        try {
          const events = await store.waitForEvents(since, { conceptId, productionId }, timeoutMs, extra.signal);
          const next = events.length ? events[events.length - 1].seq : Math.max(since, store.seq);
          return ok(
            events.length
              ? `${events.length} update(s). Next cursor: ${next}.`
              : `No updates within ${timeoutMs / 1000}s. Call again with cursor ${next}.`,
            { cursor: next, events: events.map(eventView) },
          );
        } finally {
          if (ticker) clearInterval(ticker);
        }
      }),
  );

  return server;
}
