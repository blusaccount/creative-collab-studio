import { useState } from 'react';
import type { SceneBlueprint } from '../types';
import { getLanguage, t } from '../i18n';
import { buildAiPrompt } from '../scenes/aiPrompt';
import { validateBlueprintReport } from '../scenes/build';
import { Modal } from './Modal';
import { Icon } from './Icon';

interface BlueprintImportDialogProps {
  onClose: () => void;
  onImport: (blueprint: SceneBlueprint) => void;
}

export function BlueprintImportDialog({ onClose, onImport }: BlueprintImportDialogProps) {
  const prompt = buildAiPrompt(getLanguage());
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmWarn, setConfirmWarn] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      const area = document.createElement('textarea');
      area.value = prompt;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const submit = () => {
    if (!text.trim()) {
      setError(t('blueprint.empty'));
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError(t('blueprint.invalid'));
      return;
    }
    const { blueprint, report } = validateBlueprintReport(parsed);
    if (!blueprint || report.errors.length > 0) {
      setError(report.errors.join(' ') || t('blueprint.invalid'));
      setWarnings(report.warnings);
      return;
    }
    if (report.warnings.length > 0 && !confirmWarn) {
      setError(null);
      setWarnings(report.warnings);
      setConfirmWarn(true);
      return;
    }
    onImport(blueprint);
    onClose();
  };

  return (
    <Modal
      title={t('blueprint.title')}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button className="ghost-button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="primary-button" onClick={submit}>
            <Icon name="plus" size={15} /> {confirmWarn ? t('blueprint.importAnyway') : t('blueprint.import')}
          </button>
        </>
      }
    >
      <div className="blueprint-steps">
        <section className="blueprint-step">
          <div className="blueprint-step-head">
            <h3>{t('blueprint.step1')}</h3>
            <button className="ghost-button small" onClick={copyPrompt}>
              <Icon name={copied ? 'check' : 'save'} size={14} /> {copied ? t('blueprint.copied') : t('blueprint.copyPrompt')}
            </button>
          </div>
          <p>{t('blueprint.step1Body')}</p>
          <pre className="guide-code blueprint-prompt">{prompt}</pre>
        </section>

        <section className="blueprint-step">
          <h3>{t('blueprint.step2')}</h3>
          <textarea
            className="blueprint-paste"
            rows={9}
            value={text}
            placeholder={t('blueprint.pastePlaceholder')}
            onChange={(event) => {
              setText(event.target.value);
              if (error) setError(null);
            }}
          />
          {error ? <p className="hint warn">{error}</p> : null}
          {warnings.length > 0 ? (
            <ul className="blueprint-warnings">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </Modal>
  );
}
