import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Languages } from 'lucide-react';
import { locales, useI18n } from '@/i18n';

// Two locales make a toggle the honest control: the button names the language
// it switches to, so one click is the whole interaction.
export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const next = locale === 'zh' ? 'en' : 'zh';
  return (
    <button
      type="button"
      className="language-toggle"
      onClick={() => setLocale(next)}
      aria-label={t('language.label')}
    >
      <Languages size={15} />
      {t(next === 'zh' ? 'language.zh' : 'language.en')}
    </button>
  );
}

// Inside the console shell the choice lives in the profile menu, where every
// other account-level control already is.
export function LanguageMenuGroup() {
  const { locale, setLocale, t } = useI18n();
  return (
    <>
      <DropdownMenu.Label className="menu-label"><Languages size={14} />{t('language.label')}</DropdownMenu.Label>
      <DropdownMenu.RadioGroup value={locale} onValueChange={(value) => setLocale(value as typeof locale)}>
        {locales.map((option) => (
          <DropdownMenu.RadioItem className="menu-item" key={option} value={option}>
            <span className="menu-check">{option === locale && <Check size={14} />}</span>
            {t(option === 'zh' ? 'language.zh' : 'language.en')}
          </DropdownMenu.RadioItem>
        ))}
      </DropdownMenu.RadioGroup>
    </>
  );
}
