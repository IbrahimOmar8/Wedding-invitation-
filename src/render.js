const fs = require('fs');
const path = require('path');

const THEMES_DIR = path.join(__dirname, '..', 'views', 'themes');
const cache = new Map();

function loadTheme(name) {
  const safe = String(name || 'elegant').replace(/[^a-z0-9_-]/gi, '');
  const file = path.join(THEMES_DIR, `${safe}.html`);
  if (!fs.existsSync(file)) {
    return loadTheme('elegant');
  }
  if (process.env.NODE_ENV === 'production' && cache.has(file)) return cache.get(file);
  const tpl = fs.readFileSync(file, 'utf8');
  cache.set(file, tpl);
  return tpl;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateParts(iso) {
  const d = new Date(iso || Date.now());
  if (isNaN(d.getTime())) return { dateLong: '', dateShort: '', time: '', weekday: '', iso: '' };
  const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  const weekdays = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2,'0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return {
    dateLong: `${day} ${month} ${year}`,
    dateShort: `${day}/${d.getMonth()+1}/${year}`,
    time: `${String(hours).padStart(2,'0')}:${minutes} ${ampm}`,
    weekday: weekdays[d.getDay()],
    iso: d.toISOString(),
    isoLocal: d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/, ''),
  };
}

function render(invitation, slug) {
  const tpl = loadTheme(invitation.theme);
  const dt = formatDateParts(invitation.wedding_date);

  const gallery = Array.isArray(invitation.gallery_images) ? invitation.gallery_images : [];
  const galleryHtml = gallery.length
    ? gallery.map((u, i) => `<div class="photo${i === 0 ? ' wide' : ''}"><img src="${escapeHtml(u)}" alt="memory"></div>`).join('\n')
    : '';

  const hero = invitation.hero_image && invitation.hero_image.trim()
    ? invitation.hero_image
    : '/assets/default-hero.svg';

  const mapUrl = invitation.map_url || '#';

  const calendarUrl = (() => {
    const d = new Date(invitation.wedding_date || Date.now());
    if (isNaN(d.getTime())) return '#';
    const start = d.toISOString().replace(/[-:]|\.\d{3}/g, '');
    const end = new Date(d.getTime() + 4 * 3600 * 1000).toISOString().replace(/[-:]|\.\d{3}/g, '');
    const text = encodeURIComponent(`${invitation.groom_name} & ${invitation.bride_name} Wedding`);
    const details = encodeURIComponent('Wedding Celebration');
    const location = encodeURIComponent(`${invitation.venue_name} ${invitation.venue_address || ''}`.trim());
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}&location=${location}`;
  })();

  const vars = {
    GROOM: escapeHtml(invitation.groom_name),
    BRIDE: escapeHtml(invitation.bride_name),
    QUOTE: escapeHtml(invitation.quote),
    PRESENCE: escapeHtml(invitation.presence_text),
    VENUE_NAME: escapeHtml(invitation.venue_name),
    VENUE_ADDRESS: escapeHtml(invitation.venue_address || ''),
    MAP_URL: escapeHtml(mapUrl),
    CALENDAR_URL: calendarUrl,
    HERO_IMAGE: escapeHtml(hero),
    DATE_LONG: dt.dateLong,
    DATE_SHORT: dt.dateShort,
    TIME: dt.time,
    WEEKDAY: dt.weekday,
    WEDDING_ISO: dt.iso,
    GALLERY_HTML: galleryHtml,
    SLUG: escapeHtml(slug),
    LANG: invitation.language === 'ar' ? 'ar' : 'en',
    DIR: invitation.language === 'ar' ? 'rtl' : 'ltr',
  };

  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? vars[key] : ''));
}

module.exports = { render };
