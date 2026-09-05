import { useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import type { Generation } from '../types';

// Sharing is two independent decisions, both the author's: the work, and the
// prompt behind it. Withdrawing the work withdraws the prompt with it, so the
// prompt box is disabled — and cleared — whenever the work box is off.
//
// State is optimistic: the boxes move at once and roll back if the gateway
// refuses. Seed the state by mounting one instance per generation (`key`).
export function ShareToggles({
  generationId,
  shared,
  sharedPrompt,
  onUpdated,
}: {
  generationId: string;
  shared: boolean;
  sharedPrompt: boolean;
  onUpdated?: (generation: Generation) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState({ shared, sharedPrompt });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function apply(next: { shared: boolean; sharedPrompt: boolean }) {
    const previous = value;
    setValue(next);
    setBusy(true);
    setError('');
    try {
      const updated = await api<Generation>(
        `/v1/generations/${generationId}/share`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            shared: next.shared,
            shared_prompt: next.sharedPrompt,
          }),
        },
      );
      setValue({
        shared: updated.shared ?? next.shared,
        sharedPrompt: updated.shared_prompt ?? next.sharedPrompt,
      });
      onUpdated?.(updated);
    } catch (reason) {
      setValue(previous);
      setError(
        reason instanceof Error ? reason.message : t('share.errorUpdate'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="share-toggles">
      <label className="topup-switch">
        <input
          type="checkbox"
          checked={value.shared}
          disabled={busy}
          onChange={(event) =>
            void apply({
              shared: event.target.checked,
              sharedPrompt: event.target.checked ? value.sharedPrompt : false,
            })
          }
        />
        <span>{t('share.shareWork')}</span>
      </label>
      <label className="topup-switch">
        <input
          type="checkbox"
          checked={value.shared && value.sharedPrompt}
          disabled={busy || !value.shared}
          onChange={(event) =>
            void apply({ shared: true, sharedPrompt: event.target.checked })
          }
        />
        <span>{t('share.sharePrompt')}</span>
      </label>
      <small className="share-note">{t('share.note')}</small>
      {error && (
        <small className="share-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
