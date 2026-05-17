const { t, months, weekdays } = require('../src/i18n');

describe('i18n.t', () => {
  test('returns Arabic translations when lang=ar', () => {
    const T = t('ar');
    expect(T.SAVE_DATE).toBe('احفظ التاريخ');
    expect(T.WILL_YOU_JOIN).toBe('هل ستشاركوننا الفرحة؟');
  });
  test('falls back to English for unknown locales', () => {
    expect(t('fr').SAVE_DATE).toBe('SAVE THE DATE');
    expect(t(undefined).DAYS).toBe('DAYS');
  });
});

describe('i18n.months / weekdays', () => {
  test('Arabic months and days are localized', () => {
    expect(months('ar')[0]).toBe('يناير');
    expect(weekdays('ar')[5]).toBe('الجمعة');
  });
  test('English months and days are uppercased', () => {
    expect(months('en')[0]).toBe('JANUARY');
    expect(weekdays('en')[1]).toBe('MONDAY');
  });
});
