/**
 * Add a downloadable .ics link next to existing "Add to Calendar" buttons.
 * Idempotent via marker `<!-- ICS -->`.
 */
const fs = require('fs');
const path = require('path');

const THEMES_DIR = path.join(__dirname, '..', 'views', 'themes');
const MARKER = '<!-- ICS -->';

// JS injected at the bottom of each theme: finds the Add-to-Calendar
// links and adds a sibling "Download .ics" link.
const SCRIPT = `
${MARKER}
<script>
(function() {
  const SLUG = '{{SLUG}}';
  document.querySelectorAll('a[href*="calendar/render"], .btn[href*="calendar.google.com"]').forEach(a => {
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;gap:0.4rem;margin-top:0.5rem';
    a.parentNode.insertBefore(wrap, a);
    wrap.appendChild(a);
    const ics = document.createElement('a');
    ics.href = '/i/' + SLUG + '/event.ics';
    ics.setAttribute('download', SLUG + '.ics');
    ics.className = a.className;
    ics.textContent = (document.documentElement.lang === 'ar') ? 'Apple/Outlook' : 'Apple / Outlook';
    ics.style.opacity = '0.85';
    wrap.appendChild(ics);
  });
})();
</script>
`;

const files = fs.readdirSync(THEMES_DIR).filter(f => f.endsWith('.html'));
let updated = 0;
for (const f of files) {
  const full = path.join(THEMES_DIR, f);
  let src = fs.readFileSync(full, 'utf8');
  if (src.includes(MARKER)) { console.log('skip:', f); continue; }
  src = src.replace('</body>', SCRIPT + '\n</body>');
  fs.writeFileSync(full, src);
  console.log('updated:', f);
  updated++;
}
console.log(`Done. ${updated} themes updated.`);
