import { toCents } from './to-cents.util';

describe('toCents', () => {
  it.each([
    [0, 0],
    [12.34, 1234],
    [0.1 + 0.2, 30],
    [1234.56, 123456],
    [19.99, 1999],
    [1.005, 101],
    [2.675, 268],
    [-12.34, -1234],
    [-1.005, -101],
  ])('%p → %p cents', (amount, cents) => {
    expect(toCents(amount)).toBe(cents);
  });
});
