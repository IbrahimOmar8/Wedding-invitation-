const fs = require('fs');
const path = require('path');
const db = require('./db');
const { t, months, weekdays } = require('./i18n');
const { escapeHtml, safeUrl } = require('./util');

const THEMES_DIR = path.join(__dirname, '..', 'views', 'themes');
const cache = new Map();

function loadTheme(name) {
  const safe = String(name || 'elegant').replace(/[^a-z0-9_-]/gi, '');
  const file = path.join(THEMES_DIR, `${safe}.html`);
  if (!fs.existsSync(file)) return loadTheme('elegant');
  if (process.env.NODE_ENV === 'production' && cache.has(file)) return cache.get(file);
  const tpl = fs.readFileSync(file, 'utf8');
  cache.set(file, tpl);
  return tpl;
}

function formatDateParts(iso, lang) {
  const d = new Date(iso || Date.now());
  if (isNaN(d.getTime())) return { dateLong: '', time: '', weekday: '', iso: '' };
  const M = months(lang);
  const W = weekdays(lang);
  const day = d.getDate();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? (lang === 'ar' ? 'م' : 'PM') : (lang === 'ar' ? 'ص' : 'AM');
  hours = hours % 12 || 12;
  return {
    dateLong: lang === 'ar' ? `${day} ${M[d.getMonth()]} ${d.getFullYear()}` : `${day} ${M[d.getMonth()]} ${d.getFullYear()}`,
    time: `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`,
    weekday: W[d.getDay()],
    iso: d.toISOString(),
  };
}

function renderEvents(invId, lang) {
  const events = db.prepare('SELECT * FROM events WHERE invitation_id = ? ORDER BY sort_order ASC, id ASC').all(invId);
  if (!events.length) return '';
  const T = t(lang);
  return events.map(e => {
    const dt = formatDateParts(e.event_date, lang);
    const dateBit = e.event_date ? `<div class="ev-date">${escapeHtml(dt.dateLong)} · ${escapeHtml(dt.time)}</div>` : '';
    const mapBit = safeUrl(e.map_url) ? `<a class="ev-link" href="${escapeHtml(e.map_url)}" target="_blank" rel="noopener">${escapeHtml(T.GET_DIRECTIONS)}</a>` : '';
    return `<li class="event-item">
      <div class="ev-icon">${escapeHtml(e.icon || '♥')}</div>
      <div class="ev-body">
        <h3>${escapeHtml(e.title)}</h3>
        ${dateBit}
        ${e.venue_name ? `<div class="ev-venue">${escapeHtml(e.venue_name)}${e.venue_address ? ' — ' + escapeHtml(e.venue_address) : ''}</div>` : ''}
        ${mapBit}
      </div>
    </li>`;
  }).join('\n');
}

function renderStory(invId) {
  const items = db.prepare('SELECT * FROM story WHERE invitation_id = ? ORDER BY sort_order ASC, id ASC').all(invId);
  if (!items.length) return '';
  return items.map(s => `<li class="story-item">
    <div class="st-marker"></div>
    <div class="st-body">
      ${s.sub ? `<div class="st-sub">${escapeHtml(s.sub)}</div>` : ''}
      <h3>${escapeHtml(s.title)}</h3>
      ${s.body ? `<p>${escapeHtml(s.body)}</p>` : ''}
    </div>
  </li>`).join('\n');
}

function renderRegistry(invId) {
  const items = db.prepare('SELECT * FROM registry WHERE invitation_id = ? ORDER BY sort_order ASC, id ASC').all(invId);
  if (!items.length) return '';
  return items.map(r => `<a class="reg-item" href="${escapeHtml(safeUrl(r.url) || '#')}" target="_blank" rel="noopener">
    <h3>${escapeHtml(r.title)}</h3>
    ${r.description ? `<p>${escapeHtml(r.description)}</p>` : ''}
  </a>`).join('\n');
}

function renderWishes(invId) {
  const wishes = db.prepare('SELECT * FROM wishes WHERE invitation_id = ? AND approved = 1 ORDER BY created_at DESC LIMIT 30').all(invId);
  if (!wishes.length) return '';
  return wishes.map(w => `<div class="wish">
    <p class="wish-msg">${escapeHtml(w.message)}</p>
    <p class="wish-name">— ${escapeHtml(w.guest_name)}</p>
  </div>`).join('\n');
}

function render(invitation, slug, guest = null) {
  const lang = invitation.language === 'ar' ? 'ar' : 'en';
  const T = t(lang);
  const tpl = loadTheme(invitation.theme);
  const dt = formatDateParts(invitation.wedding_date, lang);

  const gallery = Array.isArray(invitation.gallery_images) ? invitation.gallery_images : [];
  const galleryHtml = gallery.length
    ? gallery.map((u, i) => `<div class="photo${i === 0 ? ' wide' : ''}"><img src="${escapeHtml(u)}" alt="memory"></div>`).join('\n')
    : '';

  const hero = invitation.hero_image && invitation.hero_image.trim() ? invitation.hero_image : '/assets/default-hero.svg';
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

  const eventsHtml = renderEvents(invitation.id, lang);
  const storyHtml = renderStory(invitation.id);
  const registryHtml = renderRegistry(invitation.id);
  const wishesHtml = renderWishes(invitation.id);

  const guestGreeting = guest
    ? `<div class="guest-greeting"><span class="gg-label">${escapeHtml(T.HELLO_GUEST)}</span><span class="gg-name">${escapeHtml(guest.name)}</span><span class="gg-note">${escapeHtml(T.PERSONAL_NOTE)}</span></div>`
    : '';

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
    TIME: dt.time,
    WEEKDAY: dt.weekday,
    WEDDING_ISO: dt.iso,
    GALLERY_HTML: galleryHtml,
    EVENTS_HTML: eventsHtml,
    STORY_HTML: storyHtml,
    REGISTRY_HTML: registryHtml,
    WISHES_HTML: wishesHtml,
    GUEST_GREETING: guestGreeting,
    GUEST_NAME: escapeHtml(guest?.name || ''),
    GUEST_TOKEN: escapeHtml(guest?.token || ''),
    SLUG: escapeHtml(slug),
    LANG: lang,
    DIR: lang === 'ar' ? 'rtl' : 'ltr',
  };

  // Translation tokens prefixed with T_
  for (const [k, v] of Object.entries(T)) vars['T_' + k] = escapeHtml(v);

  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? vars[key] : ''));
}

module.exports = { render };
