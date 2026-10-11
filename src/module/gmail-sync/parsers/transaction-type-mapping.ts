/**
 * Pure lookup table — NOT a service — mapping a bank's raw `{TIPO}` string
 * (as it appears verbatim in the email, see `ParsedBankEmail.transactionType`)
 * to whether it represents money coming in or going out.
 *
 * Deliberately minimal: only types we've actually seen in a real email are
 * listed. Anything else must go through `NeedsReview` rather than guessing —
 * see the task spec for why "Compra"/"Transferencia" are intentionally
 * absent (no real sample yet, and some banks may not even email those).
 */
export const TRANSACTION_TYPE_MAPPING: Record<
  string,
  { kind: 'income' | 'expense' }
> = {
  'Recarga de Celular': { kind: 'expense' },
};

/** Returns `undefined` for any `{TIPO}` not explicitly listed above — callers
 * must treat that as "unknown, needs review", never default to a guess. */
export function resolveTransactionKind(
  transactionType: string,
): { kind: 'income' | 'expense' } | undefined {
  return TRANSACTION_TYPE_MAPPING[transactionType];
}
