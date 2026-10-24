/**
 * Shape of each parser's `transactionKinds`: a bank's raw `{TIPO}` string
 * (verbatim from the email, see `ParsedBankEmail.transactionType`) mapped to
 * whether it represents money coming in or going out.
 *
 * Each table is deliberately minimal: only types seen in a real email are
 * listed. Anything else must go through `NeedsReview` rather than guessing.
 */
export type TransactionKindMapping = Record<
  string,
  { kind: 'income' | 'expense' }
>;

/** Returns `undefined` for any `{TIPO}` not explicitly listed in `mapping` —
 * callers must treat that as "unknown, needs review", never default to a
 * guess. `hasOwnProperty` so "constructor" & co. never match. */
export function resolveTransactionKind(
  mapping: TransactionKindMapping,
  transactionType: string,
): { kind: 'income' | 'expense' } | undefined {
  return Object.prototype.hasOwnProperty.call(mapping, transactionType)
    ? mapping[transactionType]
    : undefined;
}
