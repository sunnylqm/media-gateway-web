import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '../api';
import { formatAmount } from '../format';
import { useI18n } from '../i18n';
import type { CurrencyPresentation } from '../types';
import {
  basePresentation,
  exchangeRateLabel,
  isConverted,
  normalizePresentation,
  toDisplay,
} from './currency';

// Every amount the API returns — balances, transactions, model prices, quotes —
// is base-currency minor units. The tenant console wraps itself in this
// provider so those amounts are shown in the currency the viewer is charged in.
// The administrator console deliberately does not: an administrator reasons
// about the ledger, which is kept in the base currency.
const CurrencyContext = createContext<CurrencyPresentation>(basePresentation);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [presentation, setPresentation] =
    useState<CurrencyPresentation>(basePresentation);

  useEffect(() => {
    let active = true;
    api<unknown>('/v1/billing/currency').then(
      (value) => {
        if (active) setPresentation(normalizePresentation(value));
      },
      () => {
        // The endpoint never fails hard. A viewer whose presentation could not
        // be read keeps seeing the base currency, which is what is stored.
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return (
    <CurrencyContext.Provider value={presentation}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyPresentation {
  return useContext(CurrencyContext);
}

export type MoneyFormatter = {
  presentation: CurrencyPresentation;
  converted: boolean;
  // Takes base-currency minor units and returns the viewer's currency. The
  // optional currency is the base currency the amount was quoted in, used only
  // when nothing is converted so a record keeps the code the API sent.
  money: (baseMinorUnits: number, baseCurrency?: string) => string;
  rateLabel: string;
};

export function useMoney(): MoneyFormatter {
  const presentation = useCurrency();
  return useMemo(() => {
    const converted = isConverted(presentation);
    return {
      presentation,
      converted,
      money: (baseMinorUnits: number, baseCurrency?: string) =>
        converted
          ? formatAmount(
              toDisplay(baseMinorUnits, presentation),
              presentation.currency,
            )
          : formatAmount(
              baseMinorUnits,
              baseCurrency || presentation.base_currency,
            ),
      rateLabel: converted ? exchangeRateLabel(presentation) : '',
    };
  }, [presentation]);
}

// One line wherever converted prices are listed, so nobody reads them as a live
// conversion. It renders nothing at all for a viewer billed in the base
// currency, which is the common case inside mainland China.
export function CurrencyNote({ className }: { className?: string }) {
  const { t } = useI18n();
  const { converted, presentation, rateLabel } = useMoney();
  if (!converted) return null;
  return (
    <small className={className ?? 'muted'}>
      {t('currency.priceNote', {
        base: presentation.base_currency,
        display: presentation.currency,
        rate: rateLabel,
      })}
    </small>
  );
}
