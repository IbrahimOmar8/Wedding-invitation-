const { encrypt, decrypt } = require('../src/crypto');

describe('crypto encrypt/decrypt', () => {
  beforeAll(() => { process.env.ENCRYPT_KEY = 'jest-test-key-1234567890abcdef'; });

  test('roundtrip a JWT-like token', () => {
    const plain = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MX0.sig';
    const enc = encrypt(plain);
    expect(enc).not.toBe(plain);
    expect(decrypt(enc)).toBe(plain);
  });

  test('encryption is non-deterministic (random IV)', () => {
    expect(encrypt('hello')).not.toBe(encrypt('hello'));
  });

  test('empty input round-trips to empty', () => {
    expect(encrypt('')).toBe('');
    expect(decrypt('')).toBe('');
  });

  test('tampered ciphertext returns empty (auth tag fails)', () => {
    const enc = encrypt('secret');
    const tampered = enc.slice(0, -2) + 'AA';
    expect(decrypt(tampered)).toBe('');
  });
});
