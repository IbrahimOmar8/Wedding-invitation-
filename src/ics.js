/**
 * Generate an .ics (iCalendar) file for a wedding. Compatible with
 * Apple Calendar, Outlook, Google Calendar (import), Thunderbird, etc.
 *
 * Spec: RFC 5545.
 */

function fold(line) {
  // iCal lines max 75 octets; long lines must be folded
  if (line.length <= 73) return line;
  const out = [];
  for (let i = 0; i < line.length; i += 73) {
    out.push((i === 0 ? '' : ' ') + line.slice(i, i + 73));
  }
  return out.join('\r\n');
}

function fmt(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function build({ groom, bride, date, durationHours, venue, address, description, url, uid }) {
  const start = fmt(date);
  if (!start) return null;
  const end = fmt(new Date(new Date(date).getTime() + (durationHours || 4) * 3600_000));
  const dtstamp = fmt(new Date());
  const summary = `${groom} & ${bride} — Wedding`;
  const loc = [venue, address].filter(Boolean).join(', ');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WedCard//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    fold('UID:' + (uid || (`${start}-${summary.replace(/\s/g, '')}@wedcard`))),
    'DTSTAMP:' + dtstamp,
    'DTSTART:' + start,
    'DTEND:' + end,
    fold('SUMMARY:' + escape(summary)),
    fold('DESCRIPTION:' + escape(description || `Wedding of ${groom} & ${bride}`)),
    fold('LOCATION:' + escape(loc)),
    url ? fold('URL:' + url) : null,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    // Reminder 1 day before
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    fold('DESCRIPTION:' + escape(`${summary} tomorrow`)),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.join('\r\n');
}

module.exports = { build };
