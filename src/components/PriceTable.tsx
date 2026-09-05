import { formatLabel, formatParameterValue } from '../format';
import { useI18n } from '../i18n';
import { CurrencyNote, useMoney } from '../lib/money';
import {
  estimateQuantity,
  fallbackRate,
  resolveRate,
  unitAmount,
} from '../lib/requestForm';
import type { ModelBilling } from '../types';

export function PriceTable({
  billing,
  parameters,
  admin = false,
  showNote = true,
}: {
  billing?: ModelBilling;
  parameters: Record<string, string>;
  admin?: boolean;
  showNote?: boolean;
}) {
  const { t } = useI18n();
  // Model prices arrive as base-currency minor units like every other amount.
  const { money, converted } = useMoney();

  if (!billing) return null;

  if (billing.mode === 'free') {
    return (
      <section className="price-table" aria-label={t('composer.priceTable')}>
        <div className="price-table-heading">
          <h4>{t('composer.priceTable')}</h4>
          <small>{t('composer.free')}</small>
        </div>
        <p className="price-table-free-note">{t('playground.freeModelNote')}</p>
      </section>
    );
  }

  const dimensions = Object.fromEntries(
    Object.entries(parameters).filter(([, value]) => value !== ''),
  );
  const matched = resolveRate(billing, dimensions);
  const fallback = fallbackRate(billing);
  const hasRates = (billing.rates?.length ?? 0) > 0;
  const flat = !hasRates;
  const showFallback = admin || flat;
  const rows = [...(billing.rates ?? []), ...(showFallback ? [fallback] : [])];
  const quantity = estimateQuantity(billing, dimensions);
  const unit = t(
    billing.mode === 'per_output_second'
      ? 'composer.unitSecond'
      : 'composer.unitImage',
  );

  return (
    <section className="price-table" aria-label={t('composer.priceTable')}>
      <div className="price-table-heading">
        <h4>{t('composer.priceTable')}</h4>
        <small>
          {[
            flat ? t('composer.priceFlatRule') : t('composer.priceRule'),
            quantity === null
              ? ''
              : t('composer.priceQuantity', { count: quantity, unit }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </small>
      </div>
      <table>
        <thead>
          <tr>
            <th>{t('composer.priceTier')}</th>
            <th>{t('composer.priceSelector')}</th>
            <th className="numeric">{t('composer.pricePerUnit', { unit })}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((rate, index) => {
            const isFallback = rate === fallback;
            const selected =
              rate.label === matched.label &&
              JSON.stringify(rate.dimensions ?? {}) ===
                JSON.stringify(matched.dimensions ?? {});
            return (
              <tr
                key={`${rate.label}-${index}`}
                className={selected ? 'selected' : undefined}
                aria-current={selected ? 'true' : undefined}
              >
                <td>
                  {isFallback
                    ? t(flat ? 'composer.priceFlat' : 'composer.priceFallback')
                    : rate.label}
                </td>
                <td className="price-selector">
                  {isFallback
                    ? t(
                        flat
                          ? 'composer.priceFlatNote'
                          : 'composer.priceFallbackNote',
                      )
                    : Object.entries(rate.dimensions ?? {})
                        .map(
                          ([name, value]) =>
                            `${formatLabel(name)} = ${formatParameterValue(value)}`,
                        )
                        .join(' · ')}
                </td>
                <td className="numeric">
                  {money(
                    unitAmount({ ...rate, dimensions: rate.dimensions ?? {} }),
                    billing.currency,
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {converted && (
        <div className="price-table-footer-note">
          <CurrencyNote />
        </div>
      )}
      {showNote && (
        <div className="price-table-footer-note">
          {admin ? (
            <small>{t('composer.adminNoCharge')}</small>
          ) : billing.mode === 'per_output_second' ? (
            <small>{t('composer.estimateNote')}</small>
          ) : billing.mode === 'per_request' ? (
            <small>
              {t(
                billing.rates?.length
                  ? 'composer.perImageNote'
                  : 'composer.flatImageNote',
              )}
            </small>
          ) : null}
        </div>
      )}
    </section>
  );
}
