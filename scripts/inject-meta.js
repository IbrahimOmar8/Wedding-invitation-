/**
 * Adds Open Graph meta, livestream section, music toggle button + sw
 * registration to every theme. Idempotent via marker `<!-- META -->`.
 */
const fs = require('fs');
const path = require('path');

const THEMES_DIR = path.join(__dirname, '..', 'views', 'themes');
const MARKER = '<!-- META -->';

const META_BLOCK = `${MARKER}
{{OG_META}}
{{ACCENT_CSS}}
<style>
  #music-toggle { position: fixed; bottom: 1rem; right: 1rem; width: 48px; height: 48px; border-radius: 50%; border: 1px solid currentColor; background: rgba(255,255,255,0.85); color: var(--gold-d, #8a6620); font-size: 1.3rem; cursor: pointer; z-index: 999; box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: transform 0.2s, background 0.2s; }
  #music-toggle:hover { transform: scale(1.08); }
  #music-toggle.on { background: var(--gold, #b78a3a); color: white; }
  .livestream-section { padding: 3rem 1.5rem; }
  .livestream-link { display: inline-block; padding: 1rem 2rem; background: #c4302b; color: white; text-decoration: none; border-radius: 6px; font-size: 1rem; letter-spacing: 0.05em; }
  .livestream-link:hover { background: #a02520; }
  body.std-mode .block:not(.hero):not(.families):not(.count) { display: none; }
</style>
`;

const SW_REG = `
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{}));
  }
</script>
`;

const files = fs.readdirSync(THEMES_DIR).filter(f => f.endsWith('.html'));
let updated = 0;
for (const f of files) {
  const full = path.join(THEMES_DIR, f);
  let src = fs.readFileSync(full, 'utf8');
  if (src.includes(MARKER)) { console.log('skip:', f); continue; }
  src = src.replace('</head>', `${META_BLOCK}\n</head>`);
  // Inject music toggle + livestream section just before <footer>
  if (src.includes('<footer>')) {
    src = src.replace('<footer>', `{{LIVESTREAM_HTML}}\n{{MUSIC_HTML}}\n<footer>`);
  }
  // Add save-the-date body class hint + sw registration before </body>
  src = src.replace('<body>', '<body class="{{SAVE_THE_DATE_CLASS}}">');
  src = src.replace('</body>', `${SW_REG}\n</body>`);
  fs.writeFileSync(full, src);
  console.log('updated:', f);
  updated++;
}
console.log(`Done. ${updated} themes updated.`);
