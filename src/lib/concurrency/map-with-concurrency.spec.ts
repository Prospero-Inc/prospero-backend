import { mapWithConcurrency } from './map-with-concurrency';

describe('mapWithConcurrency', () => {
  it('processes every item, never more than `limit` at a time', async () => {
    let inFlight = 0;
    let peak = 0;
    const seen: number[] = [];

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.push(item);
      inFlight -= 1;
    });

    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });

  it('does nothing for an empty list', async () => {
    const worker = jest.fn();
    await mapWithConcurrency([], 3, worker);
    expect(worker).not.toHaveBeenCalled();
  });
});
