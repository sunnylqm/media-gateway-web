import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';

// AdvancedOptions folds away the parameters a model marks as advanced: optional
// ones most people never change. It starts closed on every form.
export function AdvancedOptions({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const { t } = useI18n();
  if (!count) return null;
  return (
    <details className="advanced-options">
      <summary>
        <ChevronRight size={14} aria-hidden className="advanced-chevron" />
        {t('form.advanced', { count })}
      </summary>
      <div className="advanced-options-body">{children}</div>
    </details>
  );
}
