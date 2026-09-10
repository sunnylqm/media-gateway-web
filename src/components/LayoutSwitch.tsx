import { ArrowLeftRight } from 'lucide-react';
import { useI18n } from '../i18n';
import { usePreferences } from '../lib/preferencesContext';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

// Swaps the controls and the preview. Which side someone wants their hands on
// is a habit, not a per-page choice, so the setting is one and both playground
// pages read it — and it lives on the account, so a second browser agrees.
export function LayoutSwitch() {
  const { t } = useI18n();
  const { preferences, setPlaygroundLayout } = usePreferences();
  const controlsRight = preferences.playgroundLayout === 'input_right';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="playground-layout-switch"
          aria-label={t('playground.layoutSwap')}
          onClick={() =>
            setPlaygroundLayout(controlsRight ? 'input_left' : 'input_right')
          }
        >
          <ArrowLeftRight size={13} />
          <span>
            {controlsRight
              ? t('playground.layoutControlsRight')
              : t('playground.layoutControlsLeft')}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{t('playground.layoutSwap')}</TooltipContent>
    </Tooltip>
  );
}
