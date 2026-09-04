import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import {
  parseTopupAmount,
  topupAmountLabel,
  topupReturnURL,
} from '../lib/topup';
import type { Topup, TopupOptions } from '../types';

// Self-service card top-up. This is the tenant-facing dialog that hands the
// browser to Stripe Checkout; the administrator's manual credit dialog is
// `TopupDialog` and posts to a different endpoint entirely.
export function StripeTopupDialog({
  options,
  open,
  onOpenChange,
}: {
  options: TopupOptions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<number | null>(
    options.amounts[0] ?? null,
  );
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelected(options.amounts[0] ?? null);
    setCustom('');
    setError('');
    setBusy(false);
  }, [open, options.amounts]);

  const bounds = { min: options.min_amount, max: options.max_amount };
  const customAmount = custom.trim()
    ? parseTopupAmount(custom, bounds)
    : undefined;
  const amount =
    customAmount?.ok === true ? customAmount.amount : (selected ?? null);

  function customError(): string {
    if (!customAmount || customAmount.ok) return '';
    if (customAmount.reason === 'below_min')
      return t('topup.errorBelowMin', {
        min: topupAmountLabel(options.min_amount, options.currency),
      });
    if (customAmount.reason === 'above_max')
      return t('topup.errorAboveMax', {
        max: topupAmountLabel(options.max_amount, options.currency),
      });
    return t('topup.errorInvalid');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = customError();
    if (invalid) {
      setError(invalid);
      return;
    }
    if (amount === null) return;
    setBusy(true);
    setError('');
    try {
      const topup = await api<Topup>('/v1/billing/topups', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          return_url: topupReturnURL(window.location),
        }),
      });
      if (!topup.checkout_url) throw new Error(t('topup.errorCreate'));
      window.location.assign(topup.checkout_url);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t('topup.errorCreate'),
      );
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content small">
          <form onSubmit={submit}>
            <div className="dialog-heading">
              <div>
                <Dialog.Title>{t('topup.dialogTitle')}</Dialog.Title>
                <Dialog.Description>{t('topup.dialogNote')}</Dialog.Description>
              </div>
              <Dialog.Close
                className="icon-button"
                type="button"
                disabled={busy}
              >
                <X size={18} />
              </Dialog.Close>
            </div>
            {error && (
              <div
                className="banner-error"
                role="alert"
                style={{ margin: '12px 0' }}
              >
                {error}
              </div>
            )}
            <div className="topup-fields">
              {options.amounts.length > 0 && (
                <div className="field">
                  <span className="field-label">{t('topup.presetLabel')}</span>
                  <div className="topup-amount-grid">
                    {options.amounts.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`topup-amount${
                          !custom.trim() && selected === value
                            ? ' selected'
                            : ''
                        }`}
                        disabled={busy}
                        onClick={() => {
                          setSelected(value);
                          setCustom('');
                          setError('');
                        }}
                      >
                        {topupAmountLabel(value, options.currency)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {options.custom_amount && (
                <label className="field">
                  <span className="field-label">{t('topup.customLabel')}</span>
                  <input
                    type="number"
                    step="0.01"
                    min={options.min_amount / 100}
                    max={options.max_amount / 100}
                    inputMode="decimal"
                    className="text-input"
                    placeholder={t('topup.customPlaceholder')}
                    value={custom}
                    disabled={busy}
                    onChange={(event) => {
                      setCustom(event.target.value);
                      setError('');
                    }}
                  />
                  <small>
                    {t('topup.customRange', {
                      min: topupAmountLabel(
                        options.min_amount,
                        options.currency,
                      ),
                      max: topupAmountLabel(
                        options.max_amount,
                        options.currency,
                      ),
                    })}
                  </small>
                </label>
              )}
              {amount !== null && !customError() && (
                <small className="muted">
                  {t('topup.selectedAmount', {
                    amount: topupAmountLabel(amount, options.currency),
                  })}
                </small>
              )}
            </div>
            <div className="dialog-actions">
              <Dialog.Close
                className="button secondary"
                type="button"
                disabled={busy}
              >
                {t('common.cancel')}
              </Dialog.Close>
              <button
                type="submit"
                className="button primary"
                disabled={busy || amount === null}
              >
                {t(busy ? 'topup.submitting' : 'topup.submit')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
