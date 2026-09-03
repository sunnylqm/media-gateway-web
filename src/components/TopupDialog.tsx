import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { type FormEvent, useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { buildCreditRequest, type CreditRequest } from '../lib/billing';
import type { User } from '../types';

export function TopupDialog({
  user,
  open,
  onOpenChange,
  onSubmit,
}: {
  user: Pick<User, 'id' | 'email'> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (request: CreditRequest) => Promise<void>;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const userID = user?.id;

  useEffect(() => {
    if (!open || !userID) return;
    setAmount('');
    setReason('');
    setError('');
    setReference(crypto.randomUUID());
  }, [open, userID]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || !reference) return;
    const request = buildCreditRequest(
      amount,
      reason,
      t('users.topupDefaultReason'),
      reference,
    );
    if (!request) {
      setError(t('users.topupInvalidAmount'));
      return;
    }

    setBusy(true);
    setError('');
    try {
      await onSubmit(request);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('users.topupError'));
    } finally {
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
                <Dialog.Title>{t('users.dialogTopupTitle')}</Dialog.Title>
                <Dialog.Description>
                  {t('users.dialogTopupNote')} ({user?.email ?? ''})
                </Dialog.Description>
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
              <label className="field">
                <span className="field-label">{t('users.topupAmount')}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  className="text-input"
                  placeholder={t('users.topupAmountPlaceholder')}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">{t('users.topupReason')}</span>
                <input
                  type="text"
                  className="text-input"
                  placeholder={t('users.topupReasonPlaceholder')}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
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
                disabled={busy || !amount || !reference}
              >
                {t(busy ? 'users.topupSubmitting' : 'users.topupSubmit')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
