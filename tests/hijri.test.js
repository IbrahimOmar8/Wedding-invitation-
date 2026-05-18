const { toHijri, formatHijri } = require('../src/hijri');

describe('hijri.toHijri', () => {
  test('converts a known Gregorian date', () => {
    // 8 May 2026 — sanity range check
    const h = toHijri('2026-05-08');
    expect(h).not.toBeNull();
    expect(h.year).toBeGreaterThanOrEqual(1447);
    expect(h.year).toBeLessThanOrEqual(1449);
    expect(h.month).toBeGreaterThanOrEqual(1);
    expect(h.month).toBeLessThanOrEqual(12);
    expect(h.day).toBeGreaterThanOrEqual(1);
    expect(h.day).toBeLessThanOrEqual(30);
  });
  test('handles invalid dates', () => {
    expect(toHijri('not-a-date')).toBeNull();
  });
});

describe('hijri.formatHijri', () => {
  test('English formatting includes AH suffix', () => {
    const s = formatHijri('2026-05-08', 'en');
    expect(s).toMatch(/AH$/);
  });
  test('Arabic formatting uses هـ suffix and Arabic month', () => {
    const s = formatHijri('2026-05-08', 'ar');
    expect(s).toContain('هـ');
    expect(s).toMatch(/[؀-ۿ]/); // contains Arabic characters
  });
});
