import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ticket } from '../types';
import type { StudioController } from '../state/useStudio';
import { composeTicketBlob } from '../drawing/compose';
import { renderSceneBlob } from '../scenes/render';
import { validateBlueprint } from '../scenes/build';
import { hashLayers } from '../utils/hash';
import { createId } from '../utils/id';
import { t } from '../i18n';
import { bridgeApi } from './client';
import { DIRECTOR_NOTE_PREFIX, type BridgeSnapshot, type Decision, type Production, type ReworkRequest } from './protocol';
import { diffNews, findStudioScene, importKey, planImport, planOutbox, planReply, sceneRoster, toNoteRecords } from './sync';

export type BridgeStatus = 'connecting' | 'online' | 'offline';

const ONLINE_INTERVAL_MS = 2000;
const OFFLINE_INTERVAL_MS = 15000;

type Notify = (message: string, tone?: 'info' | 'success' | 'error') => void;

/**
 * Keeps the studio in sync with the local AI bridge: AI blueprints arrive as
 * tickets, AI replies arrive as ticket notes, and ticket status, notes and
 * finished artwork flow back so the AI knows what was delivered. Also exposes
 * the director's decisions. The studio works normally while the bridge is offline.
 */
export function useBridge(studio: StudioController, notify: Notify) {
  const [status, setStatus] = useState<BridgeStatus>('connecting');
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const studioRef = useRef(studio);
  studioRef.current = studio;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const snapshotRef = useRef<BridgeSnapshot | null>(null);
  // Keyed by the layer array: layer saves replace it but don't bump updatedAt.
  const hashCache = useRef(new WeakMap<Ticket['layers'], string>());
  const wake = useRef<() => void>(() => undefined);
  /** Production revisions that could not be turned into tickets here; retried after a reload. */
  const failedImports = useRef(new Set<string>());
  const lastSyncError = useRef('');

  const hashOf = useCallback((ticket: Ticket) => {
    let layerHash = hashCache.current.get(ticket.layers);
    if (layerHash === undefined) {
      layerHash = hashLayers(ticket.layers);
      hashCache.current.set(ticket.layers, layerHash);
    }
    // completedAt is part of the hash: a reworked ticket that is completed again is
    // redelivered even if the paint did not change, so the AI hears about it.
    return `${layerHash}-${ticket.background}-${ticket.dimensions.width}x${ticket.dimensions.height}-${ticket.completedAt ?? 0}`;
  }, []);

  const importProduction = useCallback(async (production: Production, projectId: string) => {
    const blueprint = validateBlueprint(production.blueprint);
    const result = blueprint
      ? await studioRef.current.importBlueprint(blueprint, projectId, undefined, { select: false })
      : null;
    if (!result) {
      failedImports.current.add(importKey(production));
      notifyRef.current(t('bridge.toast.importFailed', { name: production.name }), 'error');
      return;
    }
    const roster = sceneRoster(result.scene, result.tickets);
    await bridgeApi.markImported(production.id, {
      revision: production.revision,
      projectId,
      sceneId: result.scene.id,
      assets: roster.map((ticket) => ({
        assetId: ticket.blueprintAssetId!,
        title: ticket.title,
        status: ticket.status,
        version: ticket.version,
      })),
    });
    notifyRef.current(
      t(production.revision > 1 ? 'bridge.toast.revised' : 'bridge.toast.imported', {
        name: production.name,
        count: roster.length,
      }),
      'success',
    );
  }, []);

  /** One sync pass. Imports and replies change studio state, so at most one of each per pass. */
  const reconcile = useCallback(
    async (current: BridgeSnapshot) => {
      const { scenes, tickets, projects, activeProjectId, loading } = studioRef.current;
      if (loading) return;

      const importPlan = planImport(current, scenes, projects, activeProjectId, failedImports.current);
      if (importPlan) {
        await importProduction(importPlan.production, importPlan.projectId);
        return; // let React apply the new tickets before planning anything else
      }

      const replyPlan = planReply(current, scenes, tickets);
      if (replyPlan) {
        if (replyPlan.ticket) {
          await studioRef.current.addTicketNote(replyPlan.ticket.id, {
            id: replyPlan.reply.id,
            body: replyPlan.reply.body,
            author: t('bridge.author.ai'),
            createdAt: replyPlan.reply.createdAt,
          });
          notifyRef.current(t('bridge.toast.reply', { title: replyPlan.ticket.title }), 'info');
        }
        await bridgeApi.ackReply(replyPlan.reply.id);
        return;
      }

      for (const action of planOutbox(current, scenes, tickets, hashOf)) {
        if (action.kind === 'sync') {
          await bridgeApi.syncAsset(action.production.id, action.assetId, {
            title: action.ticket.title,
            status: action.ticket.status,
            version: action.ticket.version,
            notes: toNoteRecords(action.ticket.notes),
          });
        } else if (action.kind === 'deliver') {
          const png = await composeTicketBlob(action.ticket);
          if (png) {
            await bridgeApi.deliverAsset(action.production.id, action.assetId, png, action.hash, action.ticket.version);
          }
        } else {
          const png = await renderSceneBlob(action.scene, action.roster);
          if (png) await bridgeApi.deliverComposite(action.production.id, png, action.hash);
        }
      }
    },
    [hashOf, importProduction],
  );

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let version: number | undefined;
    let online = false;

    const tick = async () => {
      timer = undefined;
      try {
        const response = await bridgeApi.state(version);
        if (stopped) return;
        if (!('unchanged' in response)) {
          const previous = snapshotRef.current;
          snapshotRef.current = response;
          setSnapshot(response);
          if (previous) {
            const news = diffNews(previous, response);
            news.conceptsToDecide.forEach((title) => notifyRef.current(t('bridge.toast.concept', { title }), 'info'));
            news.reviewsToDecide.forEach((name) => notifyRef.current(t('bridge.toast.review', { name }), 'info'));
          }
        }
        version = response.version;
        if (!online) setStatus('online');
        online = true;
      } catch (error) {
        if (stopped) return;
        if (online) console.warn('[bridge]', error);
        online = false;
        version = undefined;
        setStatus('offline');
      }
      if (online && snapshotRef.current && !stopped) {
        try {
          await reconcile(snapshotRef.current);
          lastSyncError.current = '';
        } catch (error) {
          // A failed sync step is retried on the next tick; report each distinct problem once.
          const message = error instanceof Error ? error.message : String(error);
          if (message !== lastSyncError.current) {
            lastSyncError.current = message;
            console.warn('[bridge] sync failed', error);
            notifyRef.current(t('bridge.toast.syncFailed', { message }), 'error');
          }
          version = undefined; // refetch the full state next time
        }
      }
      if (!stopped) timer = window.setTimeout(tick, online ? ONLINE_INTERVAL_MS : OFFLINE_INTERVAL_MS);
    };

    wake.current = () => {
      if (timer === undefined) return; // a tick is running; it reschedules itself
      window.clearTimeout(timer);
      void tick();
    };
    void tick();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [reconcile]);

  const refresh = useCallback(() => wake.current(), []);

  const createIdea = useCallback(
    async (title: string, idea: string) => {
      await bridgeApi.createIdea({ title, idea });
      refresh();
    },
    [refresh],
  );

  const decideConcept = useCallback(
    async (conceptId: string, decision: Decision, feedback: string) => {
      await bridgeApi.decideConcept(conceptId, { decision, feedback });
      refresh();
    },
    [refresh],
  );

  /** ACCEPTED marks the scene finished; DECLINED reopens the reworked tickets with the director's note. */
  const decideReview = useCallback(
    async (production: Production, decision: 'accepted' | 'declined', feedback: string, rework: ReworkRequest[]) => {
      await bridgeApi.decideReview(production.id, { decision, feedback, rework });
      const current = studioRef.current;
      const scene = findStudioScene(production, current.scenes);
      if (scene && decision === 'accepted' && !scene.completedAt) {
        await current.completeScene(scene.id);
      }
      if (scene && decision === 'declined') {
        const roster = sceneRoster(scene, current.tickets);
        for (const request of rework) {
          const ticket = roster.find((item) => item.blueprintAssetId === request.assetId);
          if (!ticket) continue;
          await current.addTicketNote(
            ticket.id,
            {
              id: createId(DIRECTOR_NOTE_PREFIX),
              body: [request.note, feedback].filter(Boolean).join('\n\n'),
              author: t('bridge.author.director'),
              createdAt: Date.now(),
            },
            { status: 'in-progress', completedAt: undefined },
          );
        }
      }
      refresh();
    },
    [refresh],
  );

  /** Re-creates the tickets of a production whose studio scene was deleted. */
  const reimport = useCallback(
    async (production: Production) => {
      const current = studioRef.current;
      const projectId = current.activeProjectId || current.projects[0]?.id;
      if (!projectId) return;
      await importProduction(production, projectId);
      refresh();
    },
    [importProduction, refresh],
  );

  return { status, snapshot, refresh, createIdea, decideConcept, decideReview, reimport };
}

export type BridgeController = ReturnType<typeof useBridge>;
