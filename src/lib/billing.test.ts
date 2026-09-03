import { describe, expect, it } from 'bun:test';
import {
  buildCreditRequest,
  parseCreditAmount,
  transactionKind,
} from './billing';

describe('billing utilities', () => {
  it('matches the gateway transaction vocabulary', () => {
    expect(transactionKind('credit')).toBe('credit');
    expect(transactionKind('grant')).toBe('credit');
    expect(transactionKind('capture')).toBe('capture');
    expect(transactionKind('refund')).toBe('unknown');
  });

  it('converts positive major-unit amounts to CNY minor units', () => {
    expect(parseCreditAmount('100')).toBe(10000);
    expect(parseCreditAmount('12.34')).toBe(1234);
    expect(parseCreditAmount('0')).toBeNull();
    expect(parseCreditAmount('-1')).toBeNull();
    expect(parseCreditAmount('not-a-number')).toBeNull();
  });

  it('preserves the caller reference across a recharge retry', () => {
    const reference = 'recharge-attempt-1';
    const first = buildCreditRequest(
      '50',
      '',
      'Administrator recharge',
      reference,
    );
    const retry = buildCreditRequest(
      '50',
      '',
      'Administrator recharge',
      reference,
    );

    expect(first).toEqual({
      amount: 5000,
      currency: 'CNY',
      reason: 'Administrator recharge',
      reference,
    });
    expect(retry?.reference).toBe(first?.reference);
  });
});
