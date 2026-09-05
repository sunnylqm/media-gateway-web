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
import type { CurrencyPresentation } from '../types';
import { basePresentation, normalizePresentation } from './currency';

// A workspace is billed in one currency and every amount the API returns for it
// — balance, transactions, model prices, quotes, top-up offers — is already in
// that currency and carries it. So nothing here converts: `money()` formats the
// number it is handed with the currency that came with it. The provider is kept
// only so the rare payload without a currency of its own, and the registration
// form's list of choices, have somewhere to read the workspace currency from.
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
        // Amounts carry their own currency, so a viewer whose workspace
        // currency could not be read still sees every figure correctly.
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
  // The currency this workspace is billed in.
  currency: string;
  // Formats minor units of the currency the payload carried. The fallback is
  // the workspace currency, which is what every amount is denominated in.
  money: (minorUnits: number, currency?: string) => string;
};

export function useMoney(): MoneyFormatter {
  const presentation = useCurrency();
  return useMemo(
    () => ({
      currency: presentation.currency,
      money: (minorUnits: number, currency?: string) =>
        formatAmount(minorUnits, currency || presentation.currency),
    }),
    [presentation],
  );
}
