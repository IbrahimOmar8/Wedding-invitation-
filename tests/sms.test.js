const sms = require('../src/sms');

describe('sms.normalizePhone', () => {
  test('keeps + prefix and digits', () => {
    expect(sms.normalizePhone('+201234567890')).toBe('+201234567890');
  });
  test('strips formatting from + numbers', () => {
    expect(sms.normalizePhone('+20 (123) 456-7890')).toBe('+201234567890');
  });
  test('adds + to bare digits', () => {
    expect(sms.normalizePhone('201234567890')).toBe('+201234567890');
  });
  test('returns empty for empty', () => {
    expect(sms.normalizePhone('')).toBe('');
    expect(sms.normalizePhone(null)).toBe('');
  });
});

describe('sms.send', () => {
  test('logs to console when Twilio is not configured', async () => {
    const orig = console.log;
    let captured = null;
    console.log = (label, payload) => { captured = { label, payload }; };
    try {
      const r = await sms.send('+201234567890', 'hello');
      expect(r.dev).toBe(true);
      expect(captured?.label).toBe('[sms:dev]');
    } finally { console.log = orig; }
  });

  test('skips when recipient is empty', async () => {
    const r = await sms.send('', 'hello');
    expect(r.skipped).toBe('no recipient');
  });
});
