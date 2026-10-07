import { encryptToken, decryptToken } from './token-encryption.util';

const VALID_KEY = Buffer.alloc(32, 7).toString('base64');

describe('token-encryption.util', () => {
  const originalEnv = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = originalEnv;
  });

  it('round-trips a plaintext value through encryptToken/decryptToken', () => {
    const plaintext = 'ya29.A0ARrdaM-some-access-token';

    expect(decryptToken(encryptToken(plaintext))).toBe(plaintext);
  });

  it('produces a different ciphertext on every call for the same plaintext (random IV)', () => {
    const plaintext = 'same-token-value';

    const first = encryptToken(plaintext);
    const second = encryptToken(plaintext);

    expect(first).not.toBe(second);
    expect(decryptToken(first)).toBe(plaintext);
    expect(decryptToken(second)).toBe(plaintext);
  });

  it('throws instead of returning garbage when the packed string is corrupted', () => {
    const packed = encryptToken('a sensitive refresh token');
    const [ivB64, authTagB64, ciphertextB64] = packed.split('.');

    // Flip the authTag segment so it no longer matches the ciphertext.
    const tamperedAuthTag = Buffer.from(authTagB64, 'base64');
    tamperedAuthTag[0] ^= 0xff;
    const tampered = [
      ivB64,
      tamperedAuthTag.toString('base64'),
      ciphertextB64,
    ].join('.');

    expect(() => decryptToken(tampered)).toThrow();
  });

  it('throws on a malformed packed string missing segments', () => {
    expect(() => decryptToken('not-a-valid-packed-token')).toThrow(
      'Malformed encrypted token payload',
    );
  });

  it('throws a clear error when GMAIL_TOKEN_ENCRYPTION_KEY is not set', () => {
    delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY;

    expect(() => encryptToken('value')).toThrow(
      'GMAIL_TOKEN_ENCRYPTION_KEY is not set',
    );
  });

  it('throws a clear error when GMAIL_TOKEN_ENCRYPTION_KEY does not decode to 32 bytes', () => {
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY =
      Buffer.from('too short').toString('base64');

    expect(() => encryptToken('value')).toThrow(
      'GMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes',
    );
  });
});
