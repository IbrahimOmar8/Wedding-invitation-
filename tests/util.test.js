const { escapeHtml, safeUrl, clamp, token } = require('../src/util');

describe('util.escapeHtml', () => {
  test('escapes HTML special chars', () => {
    expect(escapeHtml('<b>"hi"</b>')).toBe('&lt;b&gt;&quot;hi&quot;&lt;/b&gt;');
  });
  test('handles null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
  test('escapes ampersand once', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });
});

describe('util.safeUrl', () => {
  test('keeps http(s) and absolute paths', () => {
    expect(safeUrl('https://x.com')).toBe('https://x.com');
    expect(safeUrl('http://x.com')).toBe('http://x.com');
    expect(safeUrl('/foo')).toBe('/foo');
    expect(safeUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
  });
  test('rejects javascript: and data: URIs', () => {
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('data:text/html,<script>')).toBe('');
  });
  test('handles falsy', () => {
    expect(safeUrl('')).toBe('');
    expect(safeUrl(null)).toBe('');
  });
});

describe('util.clamp', () => {
  test('clamps numbers', () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(0, 1, 10)).toBe(1);
    expect(clamp(99, 1, 10)).toBe(10);
  });
  test('NaN returns min', () => {
    expect(clamp('abc', 2, 10)).toBe(2);
  });
});

describe('util.token', () => {
  test('returns a string of requested length', () => {
    expect(token(10)).toHaveLength(10);
    expect(token(20)).toHaveLength(20);
  });
  test('tokens are unique-ish', () => {
    const a = token(16), b = token(16);
    expect(a).not.toBe(b);
  });
});
