/**
 * Money is moving from `Float` units to integer cents (docs/plan-remediacion.md,
 * D3). This is the one conversion the app uses, and it matches the SQL
 * backfill `ROUND(amount::numeric * 100)`: `toPrecision(12)` drops binary
 * float noise first (12.34 * 100 = 1233.9999999999998 → 1234), then halves
 * round away from zero, as Postgres does for numeric.
 */
export const toCents = (amount: number): number => {
  const cents = Math.abs(
    Number.parseFloat((Math.abs(amount) * 100).toPrecision(12)),
  );
  return Math.sign(amount) * Math.round(cents);
};
