import { Prisma } from '@prisma/client';
import { toCents } from './to-cents.util';

/**
 * Float amount column → its integer-cents twin, per model. During the
 * double-write phase of D3 every write that sets the former also sets the
 * latter (see `withCents`), so reads can later switch to cents.
 */
export const MONEY_COLUMNS: Partial<
  Record<Prisma.ModelName, { amount: string; cents: string }>
> = {
  Transaction: { amount: 'amount', cents: 'amountCents' },
  Salary: { amount: 'amount', cents: 'amountCents' },
  FixedExpense: { amount: 'amount', cents: 'amountCents' },
  ProcessedEmail: { amount: 'parsedAmount', cents: 'parsedAmountCents' },
};

type Data = Record<string, unknown>;

const isRecord = (value: unknown): value is Data =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Adds the cents twin to one `data` object, if it sets the amount. */
const addCents = (
  data: unknown,
  columns: { amount: string; cents: string },
) => {
  if (!isRecord(data) || !(columns.amount in data)) return data;

  const raw = data[columns.amount];
  const value = isRecord(raw) && 'set' in raw ? raw.set : raw;

  if (value === null) return { ...data, [columns.cents]: null };
  if (typeof value === 'number')
    return { ...data, [columns.cents]: toCents(value) };

  // increment/decrement etc. can't be mirrored without reading the row;
  // nothing uses them on money today. Fail loudly instead of drifting.
  throw new Error(
    `Unsupported write to ${columns.amount}: only plain numbers can be mirrored to ${columns.cents}`,
  );
};

const WRITE_ACTIONS = new Set<Prisma.PrismaAction>([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
]);

/** Returns `args` with every amount write mirrored to its cents column. */
export const withCents = (
  model: Prisma.ModelName | undefined,
  action: Prisma.PrismaAction,
  args: unknown,
): unknown => {
  const columns = model && MONEY_COLUMNS[model];
  if (!columns || !WRITE_ACTIONS.has(action) || !isRecord(args)) return args;

  if (action === 'upsert')
    return {
      ...args,
      create: addCents(args.create, columns),
      update: addCents(args.update, columns),
    };

  const { data } = args;
  return {
    ...args,
    data: Array.isArray(data)
      ? data.map((row) => addCents(row, columns))
      : addCents(data, columns),
  };
};
