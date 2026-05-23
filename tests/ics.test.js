const { build } = require('../src/ics');

describe('ics.build', () => {
  test('produces a valid VCALENDAR envelope', () => {
    const out = build({
      groom: 'Ibrahim', bride: 'Omnia',
      date: '2026-08-15T19:30:00Z', durationHours: 4,
      venue: 'Al-Safa Hall', address: 'Cairo, Egypt',
      description: 'Our wedding', url: 'https://wedcard.app/i/demo',
    });
    expect(out).toMatch(/^BEGIN:VCALENDAR/);
    expect(out).toMatch(/END:VCALENDAR$/);
    expect(out).toContain('BEGIN:VEVENT');
    expect(out).toContain('END:VEVENT');
    expect(out).toContain('SUMMARY:Ibrahim & Omnia — Wedding');
    expect(out).toContain('LOCATION:Al-Safa Hall\\, Cairo\\, Egypt');
    expect(out).toContain('DTSTART:20260815T193000Z');
  });

  test('returns null for invalid date', () => {
    expect(build({ groom: 'A', bride: 'B', date: 'not-a-date' })).toBeNull();
  });

  test('default duration is 4 hours', () => {
    const out = build({
      groom: 'A', bride: 'B', date: '2026-01-01T12:00:00Z',
    });
    expect(out).toContain('DTSTART:20260101T120000Z');
    expect(out).toContain('DTEND:20260101T160000Z');
  });

  test('uses provided UID when given', () => {
    const out = build({
      groom: 'A', bride: 'B', date: '2026-01-01T12:00:00Z', uid: 'custom@uid',
    });
    expect(out).toContain('UID:custom@uid');
  });

  test('escapes commas and semicolons in fields', () => {
    const out = build({
      groom: 'A; B', bride: 'C, D', date: '2026-01-01T12:00:00Z',
      venue: 'Hall, Floor; 2',
    });
    expect(out).toContain('A\\; B');
    expect(out).toContain('C\\, D');
  });
});
