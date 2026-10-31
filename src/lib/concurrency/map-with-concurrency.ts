/**
 * Runs `worker` over `items` with at most `limit` in flight at once and
 * resolves when all have settled. Each worker is responsible for its own
 * errors: a rejection here would stop handing out the remaining items.
 */
export const mapWithConcurrency = async <T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> => {
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, lane),
  );
};
