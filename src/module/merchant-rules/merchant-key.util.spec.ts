import { normalizeMerchantKey } from './merchant-key.util';

describe('normalizeMerchantKey', () => {
  it.each([
    ['Puma', 'puma'],
    ['  PUMA   El   Salvador ', 'puma el salvador'],
    ['Súper Selectos', 'super selectos'],
    ['CAFÉ ÑANDÚ', 'cafe nandu'],
    ['Super Selectos Suc. 45', 'super selectos'],
    ['Super Selectos sucursal 12', 'super selectos'],
    ['SUPER SELECTOS #123', 'super selectos'],
    ['Farmacia San Nicolás No. 3', 'farmacia san nicolas'],
    ['Pizza Hut 0042', 'pizza hut'],
    ["McDonald's", 'mcdonalds'],
    ['ELECTRONICA STEREN, S.A. de C.V.', 'electronica steren s a de c v'],
    ['Uber*Trip', 'uber trip'],
  ])('%p -> %p', (raw, expected) => {
    expect(normalizeMerchantKey(raw)).toBe(expected);
  });

  it('treats accents, case, branch numbers and spacing variants as the same key', () => {
    const keys = [
      'Súper Selectos Suc. 45',
      'SUPER SELECTOS #12',
      'super  selectos',
    ].map(normalizeMerchantKey);

    expect(new Set(keys).size).toBe(1);
  });

  it.each([[''], ['   '], ['#123'], ['1234'], [null], [undefined]])(
    'returns an empty key for %p',
    (raw) => {
      expect(normalizeMerchantKey(raw)).toBe('');
    },
  );
});
