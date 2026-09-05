import { useI18n } from '../i18n';
import type { SharePreference } from '../lib/share';

// The choice made before a job is created. The work is pre-checked because
// sharing is the point of the plaza; the prompt is not, and is ignored while
// the work is unshared.
export function ShareOptions({
  value,
  onChange,
}: {
  value: SharePreference;
  onChange: (next: SharePreference) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="share-options">
      <label className="topup-switch">
        <input
          type="checkbox"
          checked={value.share}
          onChange={(event) =>
            onChange({ ...value, share: event.target.checked })
          }
        />
        <span>{t('share.shareWork')}</span>
      </label>
      <label className="topup-switch">
        <input
          type="checkbox"
          checked={value.share && value.sharePrompt}
          disabled={!value.share}
          onChange={(event) =>
            onChange({ ...value, sharePrompt: event.target.checked })
          }
        />
        <span>{t('share.sharePrompt')}</span>
      </label>
    </div>
  );
}
