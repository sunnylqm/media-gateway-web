import { Check, ChevronDown, ExternalLink } from 'lucide-react';
import { Popover } from 'radix-ui';
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useI18n } from '../i18n';
import { Markdown, plainText, safeHref } from '../lib/markdown';
import {
  formatReleaseDate,
  isNewModel,
  newestFirst,
  priceLabel,
  providerLabel,
} from '../lib/modelCatalog';
import { useMoney } from '../lib/money';
import type { PublicModel } from '../types';

// ModelPicker replaces a plain dropdown wherever a user chooses a model: a
// name alone does not say who makes it, what it costs, how new it is, or what
// it will refuse. Each row carries the first three; the highlighted model's
// full note sits beside the list, so reading about a model is a hover rather
// than a trip to the provider's documentation.
export function ModelPicker({
  models,
  value,
  onChange,
  disabled,
  placeholder,
  size = 'field',
  ariaLabel,
}: {
  models: PublicModel[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  size?: 'field' | 'compact';
  ariaLabel?: string;
}) {
  const { t, format } = useI18n();
  const { money } = useMoney();
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const ordered = useMemo(() => newestFirst(models), [models]);
  const selected = models.find((model) => model.id === value);
  const [activeId, setActiveId] = useState(value);

  const words = useMemo(
    () => ({
      free: t('composer.free'),
      perSecond: t('composer.unitSecond'),
      perImage: t('composer.unitImage'),
    }),
    [t],
  );
  const locale = format.intl;

  useEffect(() => {
    if (open) setActiveId(value || ordered[0]?.id || '');
  }, [open, value, ordered]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-model-id="${CSS.escape(activeId)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeId]);

  const active = ordered.find((model) => model.id === activeId) ?? selected;

  function choose(id: string) {
    onChange(id);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!ordered.length) return;
    const index = Math.max(
      0,
      ordered.findIndex((model) => model.id === activeId),
    );
    const move = (next: number) => {
      event.preventDefault();
      setActiveId(ordered[(next + ordered.length) % ordered.length].id);
    };
    switch (event.key) {
      case 'ArrowDown':
        return move(index + 1);
      case 'ArrowUp':
        return move(index - 1);
      case 'Home':
        return move(0);
      case 'End':
        return move(ordered.length - 1);
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (activeId) choose(activeId);
    }
  }

  const empty = !models.length;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        type="button"
        className={`model-picker-trigger ${size}`}
        disabled={disabled || empty}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
      >
        {selected ? (
          <span className="model-picker-value">
            <span className="model-picker-name">
              {selected.display_name}
              {isNewModel(selected.released_on) && (
                <span className="model-new-badge">{t('modelPicker.new')}</span>
              )}
            </span>
            <span className="model-picker-meta">
              {providerLabel(selected)} ·{' '}
              {priceLabel(selected.billing, money, words)}
            </span>
          </span>
        ) : (
          <span className="model-picker-placeholder">
            {placeholder ?? t('modelPicker.choose')}
          </span>
        )}
        <ChevronDown size={15} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="model-picker-content"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            listRef.current?.focus();
          }}
        >
          <div
            ref={listRef}
            id={listId}
            className="model-picker-list"
            role="listbox"
            tabIndex={0}
            aria-label={t('modelPicker.listLabel')}
            aria-activedescendant={
              activeId ? `${listId}-${activeId}` : undefined
            }
            onKeyDown={onKeyDown}
          >
            {ordered.map((model) => {
              const released = formatReleaseDate(model.released_on, locale);
              const isSelected = model.id === value;
              return (
                // Keyboard selection lives on the listbox, which keeps focus and
                // points at the active row with aria-activedescendant; rows
                // only need to answer the pointer.
                // biome-ignore lint/a11y/useKeyWithClickEvents: the listbox handles the keyboard
                <div
                  key={model.id}
                  tabIndex={-1}
                  id={`${listId}-${model.id}`}
                  data-model-id={model.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`model-option${model.id === activeId ? ' active' : ''}${isSelected ? ' selected' : ''}`}
                  onMouseEnter={() => setActiveId(model.id)}
                  onClick={() => choose(model.id)}
                >
                  <span className="model-option-check" aria-hidden="true">
                    {isSelected && <Check size={14} />}
                  </span>
                  <span className="model-option-main">
                    <span className="model-option-name">
                      {model.display_name}
                      {isNewModel(model.released_on) && (
                        <span className="model-new-badge">
                          {t('modelPicker.new')}
                        </span>
                      )}
                    </span>
                    <span className="model-option-meta">
                      {providerLabel(model)}
                      {released && ` · ${released}`}
                    </span>
                    {model.notes && (
                      <span className="model-option-summary">
                        {plainText(model.notes)}
                      </span>
                    )}
                  </span>
                  <span className="model-option-price">
                    {priceLabel(model.billing, money, words)}
                  </span>
                </div>
              );
            })}
          </div>
          {active && (
            <aside className="model-picker-detail" aria-live="polite">
              <div className="model-detail-heading">
                <b>{active.display_name}</b>
                {isNewModel(active.released_on) && (
                  <span className="model-new-badge">
                    {t('modelPicker.new')}
                  </span>
                )}
              </div>
              <dl className="model-detail-facts">
                <div>
                  <dt className="sr-only">{t('models.providerName')}</dt>
                  <dd>{providerLabel(active)}</dd>
                </div>
                {active.released_on && (
                  <div>
                    <dt className="sr-only">{t('models.releasedOn')}</dt>
                    <dd>
                      {t('modelPicker.released', {
                        date: formatReleaseDate(active.released_on, locale),
                      })}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="sr-only">{t('models.columnBilling')}</dt>
                  <dd className="model-detail-price">
                    {priceLabel(active.billing, money, words)}
                  </dd>
                </div>
              </dl>
              {active.notes ? (
                <Markdown source={active.notes} className="model-notes" />
              ) : (
                <p className="model-notes muted">{t('modelPicker.noNotes')}</p>
              )}
              {active.docs_url && safeHref(active.docs_url) && (
                <a
                  className="model-docs-link"
                  href={safeHref(active.docs_url) ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={13} aria-hidden="true" />
                  {t('modelPicker.docs')}
                </a>
              )}
            </aside>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
