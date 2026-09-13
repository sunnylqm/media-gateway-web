import { formatLabel, formatParameterValue } from '../format';
import { useI18n } from '../i18n';
import { useMoney } from '../lib/money';
import { estimateQuantity, resolveRate, unitAmount } from '../lib/requestForm';
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
  // Prices arrive already resolved into the workspace's billing currency, and
  // carry it, so they are formatted exactly as they came.
  const { money } = useMoney();

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
  const rows = billing.rates ?? [];
  // A flat price is a single rate that applies to every request.
  const flat =
    rows.length === 1 && Object.keys(rows[0].dimensions ?? {}).length === 0;
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
            const selected =
              matched !== null &&
              rate.label === matched.label &&
              JSON.stringify(rate.dimensions ?? {}) ===
                JSON.stringify(matched.dimensions ?? {});
            const selector = Object.entries(rate.dimensions ?? {})
              .map(
                ([name, value]) =>
                  `${formatLabel(name)} = ${formatParameterValue(value)}`,
              )
              .join(' · ');
            return (
              <tr
                key={`${rate.label}-${index}`}
                className={selected ? 'selected' : undefined}
                aria-current={selected ? 'true' : undefined}
              >
                <td>{flat ? t('composer.priceFlat') : rate.label}</td>
                <td className="price-selector">
                  {selector || t('composer.priceFlatNote')}
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
      {matched === null && (
        <p className="price-table-gap" role="status">
          {t(rows.length ? 'composer.priceUnavailable' : 'composer.priceUnset')}
        </p>
      )}
      {showNote && (
        <div className="price-table-footer-note">
          {admin ? (
            <small>{t('composer.adminNoCharge')}</small>
          ) : billing.mode === 'per_output_second' ? (
            <small>{t('composer.estimateNote')}</small>
          ) : billing.mode === 'per_request' ? (
            <small>
              {t(flat ? 'composer.flatImageNote' : 'composer.perImageNote')}
            </small>
          ) : null}
        </div>
      )}
    </section>
  );
}
