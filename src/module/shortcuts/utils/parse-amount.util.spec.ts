import { parseShortcutAmount } from './parse-amount.util';

describe('parseShortcutAmount', () => {
  it.each<[unknown, number]>([
    ['$12.50', 12.5],
    ['12,50', 12.5],
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['12', 12],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1,234', 1234],
    ['1.234', 1234],
    ['1.234.567', 1234567],
    ['1,234,567.89', 1234567.89],
    ['US$12.50', 12.5],
    ['USD 12.50', 12.5],
    ['usd12.50', 12.5],
    ['$ 12.50', 12.5],
    ['  12.50  ', 12.5],
    ['1 234,56', 1234.56],
    ['0.99', 0.99],
    ['0,5', 0.5],
    [12.5, 12.5],
    [12, 12],
    [0.1 + 0.2, 0.3],
    [12.345, 12.35],
  ])('%p -> %p', (input, expected) => {
    expect(parseShortcutAmount(input)).toBe(expected);
  });

  it.each<[unknown]>([
    [''],
    ['   '],
    ['$'],
    ['abc'],
    ['12abc'],
    ['-12.50'],
    ['0'],
    ['0.00'],
    ['0,00'],
    [0],
    [-5],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    ['12.3456'],
    ['0.999'],
    ['1,23,4'],
    ['12,50.3'],
    ['1.234,567'],
    ['12.50.30'],
    ['.50'],
    [null],
    [undefined],
    [{}],
    [true],
  ])('rejects %p', (input) => {
    expect(parseShortcutAmount(input)).toBeNull();
  });
});
