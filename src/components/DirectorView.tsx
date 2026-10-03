import { useState } from 'react';
import type { Scene } from '../types';
import type { BridgeController } from '../bridge/useBridge';
import type { Concept, Production, ReworkRequest } from '../bridge/protocol';
import { deliveredCount, requiredAssets } from '../bridge/protocol';
import { assetImageUrl, compositeImageUrl, MCP_URL } from '../bridge/client';
import { findStudioScene } from '../bridge/sync';
import { t } from '../i18n';
import { Icon } from './Icon';

type Notify = (message: string, tone?: 'info' | 'success' | 'error') => void;

interface DirectorViewProps {
  bridge: BridgeController;
  scenes: Scene[];
  onOpenScene: (scene: Scene) => void;
  notify: Notify;
}

function useAction(notify: Notify) {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>, success?: string) => {
    setBusy(true);
    try {
      await action();
      if (success) notify(success, 'success');
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function ConceptCard({ concept, bridge, notify }: { concept: Concept; bridge: BridgeController; notify: Notify }) {
  const [feedback, setFeedback] = useState('');
  const { busy, run } = useAction(notify);
  const earlier = concept.revisions.filter((entry) => entry.decision);

  return (
    <article className="director-card">
      <header className="director-card-head">
        <span className="director-kind">
          <Icon name="bot" size={14} /> {t('director.concept.kind')}
        </span>
        <span className="director-meta">{t('director.revision', { revision: concept.revision })}</span>
      </header>
      <h3>{concept.title}</h3>
      {concept.idea ? (
        <p className="director-idea">
          <strong>{t('director.concept.idea')}</strong> {concept.idea}
        </p>
      ) : null}
      <div className="director-draft">{concept.draft}</div>
      {earlier.length > 0 ? (
        <details className="director-history">
          <summary>{t('director.history', { count: earlier.length })}</summary>
          <ul>
            {earlier.map((entry) => (
              <li key={entry.revision}>
                {t('director.revision', { revision: entry.revision })} · {t(`director.decision.${entry.decision!}`)}
                {entry.feedback ? ` — ${entry.feedback}` : ''}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <label className="field">
        <span>{t('director.feedback')}</span>
        <textarea
          rows={3}
          value={feedback}
          placeholder={t('director.concept.feedbackPlaceholder')}
          onChange={(event) => setFeedback(event.target.value)}
        />
      </label>
      <div className="director-actions">
        <button
          className="ghost-button danger-text"
          disabled={busy || !feedback.trim()}
          title={feedback.trim() ? undefined : t('director.declineNeedsFeedback')}
          onClick={() => void run(() => bridge.decideConcept(concept.id, 'declined', feedback.trim()), t('director.toast.declined'))}
        >
          <Icon name="close" size={15} /> {t('director.decline')}
        </button>
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => void run(() => bridge.decideConcept(concept.id, 'approved', feedback.trim()), t('director.toast.approved'))}
        >
          <Icon name="check" size={15} /> {t('director.approve')}
        </button>
      </div>
    </article>
  );
}

function ReviewCard({
  production,
  scene,
  bridge,
  notify,
  onOpenScene,
}: {
  production: Production;
  scene: Scene | undefined;
  bridge: BridgeController;
  notify: Notify;
  onOpenScene: (scene: Scene) => void;
}) {
  const [feedback, setFeedback] = useState('');
  const [rework, setRework] = useState<Record<string, string>>({});
  const { busy, run } = useAction(notify);
  const round = production.reviews[production.reviews.length - 1];
  const assets = requiredAssets(production);
  const reworkList: ReworkRequest[] = Object.entries(rework).map(([assetId, note]) => ({ assetId, note: note.trim() }));
  const canDecline = Boolean(feedback.trim()) || reworkList.length > 0;

  const toggle = (assetId: string) =>
    setRework((current) => {
      const next = { ...current };
      if (assetId in next) delete next[assetId];
      else next[assetId] = '';
      return next;
    });

  return (
    <article className="director-card">
      <header className="director-card-head">
        <span className="director-kind result">
          <Icon name="layers" size={14} /> {t('director.review.kind')}
        </span>
        <span className="director-meta">{t('director.review.round', { round: round?.round ?? 1 })}</span>
      </header>
      <h3>{production.name}</h3>
      {round?.summary ? <div className="director-draft">{round.summary}</div> : null}

      {production.composite ? (
        <img
          className="director-composite"
          src={compositeImageUrl(production.id, production.composite.hash)}
          alt={production.name}
        />
      ) : null}

      <p className="director-hint">{t('director.review.reworkHint')}</p>
      <div className="director-assets">
        {assets.map((asset) => {
          const selected = asset.assetId in rework;
          return (
            <div key={asset.assetId} className={`director-asset ${selected ? 'rework' : ''}`}>
              <button className="director-asset-pick" onClick={() => toggle(asset.assetId)} aria-pressed={selected}>
                {asset.delivered ? (
                  <img src={assetImageUrl(production.id, asset.assetId, asset.delivered.hash)} alt={asset.title} />
                ) : (
                  <span className="director-asset-empty">
                    <Icon name="image" size={18} />
                  </span>
                )}
                <span className="director-asset-title">{asset.title}</span>
                <span className="director-asset-flag">{selected ? t('director.review.rework') : t('director.review.ok')}</span>
              </button>
              {selected ? (
                <input
                  value={rework[asset.assetId]}
                  placeholder={t('director.review.reworkNote')}
                  onChange={(event) => setRework((current) => ({ ...current, [asset.assetId]: event.target.value }))}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <label className="field">
        <span>{t('director.feedback')}</span>
        <textarea
          rows={3}
          value={feedback}
          placeholder={t('director.review.feedbackPlaceholder')}
          onChange={(event) => setFeedback(event.target.value)}
        />
      </label>
      <div className="director-actions">
        {scene ? (
          <button className="ghost-button" onClick={() => onOpenScene(scene)}>
            <Icon name="eye" size={15} /> {t('director.openScene')}
          </button>
        ) : null}
        <span className="director-actions-spacer" />
        <button
          className="ghost-button danger-text"
          disabled={busy || !canDecline}
          title={canDecline ? undefined : t('director.review.declineNeedsInput')}
          onClick={() =>
            void run(
              () => bridge.decideReview(production, 'declined', feedback.trim(), reworkList),
              t('director.toast.sentBack', { count: reworkList.length }),
            )
          }
        >
          <Icon name="close" size={15} /> {t('director.decline')}
        </button>
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => void run(() => bridge.decideReview(production, 'accepted', feedback.trim(), []), t('director.toast.accepted'))}
        >
          <Icon name="check" size={15} /> {t('director.review.accept')}
        </button>
      </div>
    </article>
  );
}

function IdeaComposer({ bridge, notify }: { bridge: BridgeController; notify: Notify }) {
  const [title, setTitle] = useState('');
  const [idea, setIdea] = useState('');
  const { busy, run } = useAction(notify);
  const submit = async () => {
    const sent = await run(() => bridge.createIdea(title.trim(), idea.trim()), t('director.toast.ideaSent'));
    if (sent) {
      setTitle('');
      setIdea('');
    }
  };
  return (
    <section className="director-section">
      <div className="side-section-head">
        <h3>{t('director.idea.title')}</h3>
      </div>
      <div className="director-card director-composer">
        <input value={title} placeholder={t('director.idea.titlePlaceholder')} onChange={(event) => setTitle(event.target.value)} />
        <textarea
          rows={3}
          value={idea}
          placeholder={t('director.idea.placeholder')}
          onChange={(event) => setIdea(event.target.value)}
        />
        <div className="director-actions">
          <span className="director-hint">{t('director.idea.hint')}</span>
          <button className="primary-button" disabled={busy || !title.trim() || !idea.trim()} onClick={() => void submit()}>
            <Icon name="bot" size={15} /> {t('director.idea.send')}
          </button>
        </div>
      </div>
    </section>
  );
}

function OfflineCard({ bridge }: { bridge: BridgeController }) {
  return (
    <div className="director-card director-offline">
      <h3>{t('director.offline.title')}</h3>
      <p>{t('director.offline.body')}</p>
      <ol>
        <li>
          {t('director.offline.step1')} <code>npm run bridge</code>
        </li>
        <li>
          {t('director.offline.step2')} <code>claude mcp add --transport http creative-collab {MCP_URL}</code>
        </li>
      </ol>
      <button className="ghost-button" onClick={bridge.refresh}>
        <Icon name="reset" size={15} /> {t('director.offline.retry')}
      </button>
    </div>
  );
}

export function DirectorView({ bridge, scenes, onOpenScene, notify }: DirectorViewProps) {
  const snapshot = bridge.snapshot;
  const { run } = useAction(notify);
  const concepts = snapshot?.concepts ?? [];
  const productions = snapshot?.productions ?? [];

  const conceptDecisions = concepts.filter((concept) => concept.status === 'awaiting-director');
  const reviews = productions.filter((production) => production.phase === 'in-review');
  const producedConcepts = new Set(productions.map((production) => production.conceptId));
  const waitingOnAi = concepts.filter(
    (concept) =>
      concept.status === 'idea' ||
      concept.status === 'declined' ||
      (concept.status === 'approved' && !producedConcepts.has(concept.id)),
  );
  const inWork = productions.filter((production) => production.phase !== 'in-review' && production.phase !== 'accepted');
  const done = productions.filter((production) => production.phase === 'accepted');
  const decisions = conceptDecisions.length + reviews.length;

  return (
    <section className="director-panel">
      <div className="scene-head">
        <div>
          <p className="eyebrow">{t('director.eyebrow')}</p>
          <h2>{t('director.title')}</h2>
          <p className="scene-direction">{t('director.subtitle')}</p>
        </div>
        <span className={`bridge-pill ${bridge.status}`}>
          <span className="bridge-dot" /> {t(`bridge.status.${bridge.status}`)}
        </span>
      </div>

      <div className="director-body">
        {bridge.status === 'offline' ? <OfflineCard bridge={bridge} /> : null}

        {snapshot ? (
          <>
            <section className="director-section">
              <div className="side-section-head">
                <h3>{t('director.waiting')}</h3>
                <span className="count">{decisions}</span>
              </div>
              {decisions === 0 ? <p className="director-empty">{t('director.waitingEmpty')}</p> : null}
              {conceptDecisions.map((concept) => (
                <ConceptCard key={`${concept.id}-${concept.revision}`} concept={concept} bridge={bridge} notify={notify} />
              ))}
              {reviews.map((production) => (
                <ReviewCard
                  key={`${production.id}-${production.reviews.length}`}
                  production={production}
                  scene={findStudioScene(production, scenes)}
                  bridge={bridge}
                  notify={notify}
                  onOpenScene={onOpenScene}
                />
              ))}
            </section>

            {bridge.status === 'online' ? <IdeaComposer bridge={bridge} notify={notify} /> : null}

            {waitingOnAi.length + inWork.length > 0 ? (
              <section className="director-section">
                <div className="side-section-head">
                  <h3>{t('director.inWork')}</h3>
                  <span className="count">{waitingOnAi.length + inWork.length}</span>
                </div>
                <ul className="director-list">
                  {waitingOnAi.map((concept) => (
                    <li key={concept.id}>
                      <span className={`slot-dot ${concept.status === 'declined' ? 'review-ready' : 'backlog'}`} />
                      <span className="director-list-title">{concept.title}</span>
                      <span className="director-list-meta">{t(`director.conceptState.${concept.status}`)}</span>
                    </li>
                  ))}
                  {inWork.map((production) => {
                    const scene = findStudioScene(production, scenes);
                    const total = requiredAssets(production).length;
                    const delivered = deliveredCount(production);
                    return (
                      <li key={production.id}>
                        <span className={`slot-dot ${production.phase === 'delivered' ? 'complete' : 'in-progress'}`} />
                        <span className="director-list-title">{production.name}</span>
                        <span className="director-list-meta">
                          {t(`bridge.phase.${production.phase}`)}
                          {total > 0 ? ` · ${delivered}/${total}` : ''}
                        </span>
                        {scene ? (
                          <button className="ghost-button small" onClick={() => onOpenScene(scene)}>
                            {t('director.openScene')}
                          </button>
                        ) : production.importedRevision > 0 ? (
                          <button
                            className="ghost-button small"
                            onClick={() => void run(() => bridge.reimport(production))}
                            title={t('director.reimportHint')}
                          >
                            {t('director.reimport')}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {done.length > 0 ? (
              <section className="director-section">
                <div className="side-section-head">
                  <h3>{t('director.done')}</h3>
                  <span className="count">{done.length}</span>
                </div>
                <ul className="director-list">
                  {done.map((production) => {
                    const scene = findStudioScene(production, scenes);
                    return (
                      <li key={production.id}>
                        <span className="slot-dot complete" />
                        <span className="director-list-title">{production.name}</span>
                        <span className="director-list-meta">{t('bridge.phase.accepted')}</span>
                        {scene ? (
                          <button className="ghost-button small" onClick={() => onOpenScene(scene)}>
                            {t('director.openScene')}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
