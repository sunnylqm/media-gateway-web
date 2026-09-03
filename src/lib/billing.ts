export const transactionPageSize = 50;

export type TransactionKind = 'credit' | 'capture' | 'unknown';

export type CreditRequest = {
  amount: number;
  currency: string;
  reason: string;
  reference: string;
};

export function transactionKind(type: string): TransactionKind {
  if (type === 'credit' || type === 'grant') return 'credit';
  if (type === 'capture') return 'capture';
  return 'unknown';
}

export function parseCreditAmount(value: string): number | null {
  const majorUnits = Number(value);
  if (!Number.isFinite(majorUnits) || majorUnits <= 0) return null;
  const minorUnits = Math.round(majorUnits * 100);
  if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0) return null;
  return minorUnits;
}

export function buildCreditRequest(
  value: string,
  reason: string,
  defaultReason: string,
  reference: string,
): CreditRequest | null {
  const amount = parseCreditAmount(value);
  if (amount === null || !reference) return null;
  return {
    amount,
    currency: 'CNY',
    reason: reason.trim() || defaultReason,
    reference,
  };
}
