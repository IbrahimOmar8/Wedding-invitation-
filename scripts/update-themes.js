/**
 * One-shot transformer that:
 *  - Adds the shared theme-common.css link
 *  - Adds an Arabic font for RTL pages
 *  - Replaces hardcoded English labels with {{T_*}} translation tokens
 *  - Injects new sections (events, story, wishes, registry, guest greeting, share)
 *    before the existing <footer>
 *
 * Idempotent: skips files that already have the marker `<!-- TC -->`.
 */
const fs = require('fs');
const path = require('path');

const THEMES_DIR = path.join(__dirname, '..', 'views', 'themes');
const MARKER = '<!-- TC -->';

// Pairs of [exact substring to find, replacement] — order matters; specific first.
const REPLACEMENTS = [
  // Hero
  ['THE WEDDING OF', '{{T_WEDDING_OF}}'],
  ['We are getting married', '{{T_GETTING_MARRIED}}'],
  ['SAVE THE DATE', '{{T_SAVE_DATE}}'],
  ['Save The Date', '{{T_SAVE_DATE}}'],
  ['A ROYAL CELEBRATION', '{{T_WEDDING_OF}}'],
  ['Beachside Wedding', '{{T_WEDDING_OF}}'],

  // Families / invite intro
  ['An Invitation From Our Families', '{{T_FAMILIES_LABEL}}'],
  ['Together with their families', '{{T_FAMILIES_TITLE}}'],
  ['invite you to share in their joy<br>as they begin their forever together', '{{T_INVITE_TEXT}}'],
  ['VIEW LOCATION', '{{T_VIEW_LOCATION}}'],

  // Details
  ['Invitation Details', '{{T_INVITATION_DETAILS}}'],
  ['CEREMONY DETAILS', '{{T_INVITATION_DETAILS}}'],
  ['Ceremony Details', '{{T_INVITATION_DETAILS}}'],
  ['Wedding Details', '{{T_INVITATION_DETAILS}}'],
  ['The Details', '{{T_INVITATION_DETAILS}}'],
  ['&ldquo;We can&rsquo;t wait to celebrate<br>our love with all of you!&rdquo;', '&ldquo;{{T_CANT_WAIT}}&rdquo;'],
  ['Mark Your Calendar', '{{T_CANT_WAIT}}'],
  ['Join Us In Celebration', '{{T_CANT_WAIT}}'],
  ['When &amp; Where', '{{T_CANT_WAIT}}'],

  // Field labels
  ['>DATE<', '>{{T_DATE}}<'],
  ['>TIME<', '>{{T_TIME}}<'],
  ['>VENUE<', '>{{T_VENUE}}<'],
  ['>AVENUE<', '>{{T_VENUE}}<'],
  ['>Date<', '>{{T_DATE}}<'],
  ['>Time<', '>{{T_TIME}}<'],
  ['>Venue<', '>{{T_VENUE}}<'],
  ['ADD TO CALENDAR', '{{T_ADD_CALENDAR}}'],
  ['Add to Calendar', '{{T_ADD_CALENDAR}}'],
  ['Add to calendar', '{{T_ADD_CALENDAR}}'],
  ['GET DIRECTIONS', '{{T_GET_DIRECTIONS}}'],
  ['Get Directions', '{{T_GET_DIRECTIONS}}'],
  ['Get directions', '{{T_GET_DIRECTIONS}}'],
  ['>DIRECTIONS<', '>{{T_GET_DIRECTIONS}}<'],
  ['>Directions<', '>{{T_GET_DIRECTIONS}}<'],

  // Gallery
  ['Our Memories', '{{T_OUR_MEMORIES}}'],
  ['CHERISHED MOMENTS', '{{T_OUR_MEMORIES}}'],
  ['Our Garden of Memories', '{{T_OUR_MEMORIES}}'],
  ['Moments Together', '{{T_MOMENTS}}'],
  ['Our Story In Pictures', '{{T_MOMENTS}}'],
  ['Sun-Kissed Moments', '{{T_MOMENTS}}'],
  ['Polaroids', '{{T_OUR_MEMORIES}}'],

  // Countdown
  ['Counting Down', '{{T_COUNTDOWN}}'],
  ['THE COUNTDOWN BEGINS', '{{T_COUNTDOWN}}'],
  ['Until We Say &ldquo;I Do&rdquo;', '{{T_UNTIL_IDO}}'],
  ['Until Our Royal Wedding', '{{T_UNTIL_IDO}}'],
  ['Until Our Big Day', '{{T_UNTIL_IDO}}'],
  ['Until Sunset', '{{T_UNTIL_IDO}}'],
  ['Until We Marry', '{{T_UNTIL_IDO}}'],
  ['The Big Day', '{{T_UNTIL_IDO}}'],
  ['>DAYS<', '>{{T_DAYS}}<'],
  ['>HOURS<', '>{{T_HOURS}}<'],
  ['>MINS<', '>{{T_MINS}}<'],
  ['>SECS<', '>{{T_SECS}}<'],
  ['>Days<', '>{{T_DAYS}}<'],
  ['>Hours<', '>{{T_HOURS}}<'],
  ['>Mins<', '>{{T_MINS}}<'],
  ['>Secs<', '>{{T_SECS}}<'],
  ['WE WAIT FOR YOU WITH LOVE', '{{T_FINAL_NOTE}}'],

  // RSVP
  ['Kindly Reply', '{{T_KINDLY_REPLY}}'],
  ['KINDLY REPLY', '{{T_KINDLY_REPLY}}'],
  ['Will You Join Us?', '{{T_WILL_YOU_JOIN}}'],
  ['Will You Honor Us With Your Presence?', '{{T_WILL_YOU_JOIN}}'],
  ['Will You Bloom With Us?', '{{T_WILL_YOU_JOIN}}'],
  ["Y'all Coming?", '{{T_WILL_YOU_JOIN}}'],
  ['Sail With Us?', '{{T_WILL_YOU_JOIN}}'],
  ['Will You Be There?', '{{T_WILL_YOU_JOIN}}'],
  ['>Your Name<', '>{{T_YOUR_NAME}}<'],
  ['>Email (optional)<', '>{{T_EMAIL_OPT}}<'],
  ['>Will you attend?<', '>{{T_ATTEND_Q}}<'],
  ['>Yes, with joy<', '>{{T_YES_JOY}}<'],
  ['>Yes, with honor<', '>{{T_YES_JOY}}<'],
  ['>Yes, joyfully<', '>{{T_YES_JOY}}<'],
  ['>Yes, count me in<', '>{{T_YES_JOY}}<'],
  ['>Yes, I\'ll be there<', '>{{T_YES_JOY}}<'],
  ["Sorry, can't make it", '{{T_NO_SORRY}}'],
  ['>Number of Guests<', '>{{T_NUM_GUESTS}}<'],
  ['>Message (optional)<', '>{{T_MESSAGE_OPT}}<'],
  ['>SEND RSVP<', '>{{T_SEND_RSVP}}<'],
  ['>Send RSVP<', '>{{T_SEND_RSVP}}<'],
  ['Thank you! Your reply has been recorded.', '{{T_RSVP_OK}}'],
  ['Thank you. Your reply has been recorded.', '{{T_RSVP_OK}}'],
  ['Thank you kindly. Your reply has been recorded.', '{{T_RSVP_OK}}'],
];

const ARABIC_FONT = '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&family=Amiri:wght@400;700&display=swap" rel="stylesheet">';
const COMMON_CSS = '<link rel="stylesheet" href="/css/theme-common.css">';

// CSS to apply Cairo font + tweaks when dir=rtl
const RTL_CSS = `
  <style>
    html[dir=rtl] body, html[dir=rtl] .names, html[dir=rtl] h1, html[dir=rtl] h2, html[dir=rtl] h3, html[dir=rtl] .title, html[dir=rtl] .label, html[dir=rtl] .kicker, html[dir=rtl] .save-date, html[dir=rtl] .save-label, html[dir=rtl] .info-card, html[dir=rtl] .info-row, html[dir=rtl] .quote-text, html[dir=rtl] .footer-names, html[dir=rtl] .footer-sub, html[dir=rtl] .venue-line, html[dir=rtl] .u-lbl, html[dir=rtl] .num, html[dir=rtl] .btn, html[dir=rtl] .lbl, html[dir=rtl] .val, html[dir=rtl] .stamp, html[dir=rtl] .subkicker { font-family: 'Cairo', 'Amiri', sans-serif !important; letter-spacing: 0 !important; }
    html[dir=rtl] .names { font-family: 'Amiri', 'Cairo', serif !important; font-weight: 700; }
  </style>`;

const SHARED_SECTIONS_TPL = `
${MARKER}
{{GUEST_GREETING}}

{{EVENTS_SECTION_IF}}
{{STORY_SECTION_IF}}
{{WISHES_SECTION_IF}}
{{REGISTRY_SECTION_IF}}
{{SHARE_SECTION}}
`;

// HTML snippets that will be inserted (conditional via inline `style="display:none"` if empty,
// handled with JS at runtime below the script tag).
function buildSections() {
  return `
${MARKER}
{{GUEST_GREETING}}

<section class="block" id="events-section">
  <div class="center"><p class="label">{{T_EVENTS}}</p><h2 class="title">{{T_SCHEDULE}}</h2></div>
  <ul class="events-list">{{EVENTS_HTML}}</ul>
</section>

<section class="block" id="story-section">
  <div class="center"><p class="label">{{T_OUR_STORY}}</p><h2 class="title">{{T_HOW_WE_MET}}</h2></div>
  <ul class="story-list">{{STORY_HTML}}</ul>
</section>

<section class="block" id="wishes-section">
  <div class="center"><p class="label">{{T_WISHES}}</p><h2 class="title">{{T_LEAVE_WISH}}</h2></div>
  <div class="wishes-list" id="wishes-list">{{WISHES_HTML}}</div>
  <form class="wish-form" id="wish-form">
    <label>{{T_YOUR_NAME}}</label>
    <input type="text" name="guest_name" required maxlength="120">
    <label>{{T_YOUR_WISH}}</label>
    <textarea name="message" rows="3" required maxlength="500"></textarea>
    <button type="submit">{{T_SEND_WISH}}</button>
    <div class="ok-msg" id="wish-ok">{{T_WISH_OK}}</div>
  </form>
</section>

<section class="block" id="registry-section">
  <div class="center"><p class="label">{{T_REGISTRY}}</p><h2 class="title">{{T_REGISTRY_NOTE}}</h2></div>
  <div class="registry-grid">{{REGISTRY_HTML}}</div>
</section>

<section class="block">
  <div class="share-row">
    <a class="share-btn wa" id="share-wa" href="#" target="_blank" rel="noopener">WhatsApp</a>
    <button class="share-btn" id="share-copy" type="button">Copy Link</button>
  </div>
</section>
`;
}

const NEW_SCRIPT = `
<script>
  // Hide empty sections
  (function(){
    function hideIfEmpty(sel) { const el = document.querySelector(sel); if (el && !el.children.length) { const sec = el.closest('section'); if (sec) sec.style.display='none'; } }
    hideIfEmpty('.events-list');
    hideIfEmpty('.story-list');
    hideIfEmpty('.registry-grid');
    if (!document.getElementById('wishes-list').children.length) { document.getElementById('wishes-list').style.display='none'; }
  })();
  // Wish submit
  const wf = document.getElementById('wish-form');
  if (wf) wf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    const r = await fetch('/api/wishes/{{SLUG}}', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (r.ok) { document.getElementById('wish-ok').style.display='block'; e.target.querySelector('button').disabled = true; setTimeout(()=>location.reload(), 1200); }
    else { alert('Could not send wish. Please try again.'); }
  });
  // Share buttons
  (function(){
    const url = window.location.href;
    const text = document.title;
    const wa = document.getElementById('share-wa');
    if (wa) wa.href = 'https://wa.me/?text=' + encodeURIComponent(text + ' — ' + url);
    const cp = document.getElementById('share-copy');
    if (cp) cp.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); cp.textContent = '✓ Copied'; setTimeout(()=>cp.textContent='Copy Link', 1500); }
      catch (_) { prompt('Copy link:', url); }
    });
  })();
</script>
`;

function processTheme(file) {
  const full = path.join(THEMES_DIR, file);
  let src = fs.readFileSync(full, 'utf8');
  if (src.includes(MARKER)) {
    console.log('skip (already updated):', file);
    return;
  }

  // 1. Apply label replacements
  for (const [from, to] of REPLACEMENTS) {
    src = src.split(from).join(to);
  }

  // 2. Inject Arabic font + common CSS + RTL overrides before </head>
  if (!src.includes('Cairo:wght')) {
    src = src.replace('</head>', `${ARABIC_FONT}\n${COMMON_CSS}\n${RTL_CSS}\n</head>`);
  }

  // 3. Inject new sections + script just before <footer>
  const sections = buildSections();
  if (src.includes('<footer>')) {
    src = src.replace('<footer>', `${sections}\n<footer>`);
  } else {
    src = src.replace('</body>', `${sections}\n</body>`);
  }

  // 4. Inject script just before </body>
  src = src.replace('</body>', `${NEW_SCRIPT}\n</body>`);

  fs.writeFileSync(full, src);
  console.log('updated:', file);
}

const files = fs.readdirSync(THEMES_DIR).filter(f => f.endsWith('.html'));
files.forEach(processTheme);
console.log(`Done. Processed ${files.length} files.`);
