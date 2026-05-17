/**
 * Adds a Wish Listy registry section + supporting CSS to every theme.
 * Idempotent: skipped when marker `<!-- WL -->` is already present.
 */
const fs = require('fs');
const path = require('path');

const THEMES_DIR = path.join(__dirname, '..', 'views', 'themes');
const MARKER = '<!-- WL -->';

const SECTION = `
${MARKER}
<section class="block" id="wishlisty-registry-section">
  <div class="center"><p class="label">{{T_REGISTRY}}</p><h2 class="title">{{T_REGISTRY_NOTE}}</h2></div>
  <div class="wl-grid" id="wl-grid">{{WISHLISTY_REGISTRY_HTML}}</div>
</section>
`;

const CSS = `
  <style>
    .wl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; max-width: 980px; margin: 2rem auto 0; }
    .wl-item { display: flex; flex-direction: column; background: rgba(255,255,255,0.85); border-radius: 12px; overflow: hidden; border: 1px solid rgba(0,0,0,0.06); text-align: start; }
    .wl-item.wl-disabled { opacity: 0.55; }
    .wl-thumb { width: 100%; aspect-ratio: 4/3; background: rgba(0,0,0,0.04); display: flex; align-items: center; justify-content: center; font-size: 3rem; }
    .wl-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .wl-body { padding: 1rem 1.2rem 1.2rem; display: flex; flex-direction: column; gap: 0.4rem; }
    .wl-body h3 { font-size: 1.1rem; }
    .wl-body p { font-size: 0.92rem; opacity: 0.8; }
    .wl-store { font-size: 0.82rem; opacity: 0.6; font-style: italic; }
    .wl-tag { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.75rem; align-self: flex-start; margin-top: 0.3rem; }
    .wl-tag-purchased { background: #e8f3ea; color: #2d6e3f; }
    .wl-tag-reserved { background: #f4ecd8; color: #8a6620; }
    .wl-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.6rem; }
    .wl-btn { padding: 0.5rem 1rem; border-radius: 18px; font-size: 0.78rem; text-decoration: none; border: 1px solid currentColor; }
    .wl-btn-reserve { background: #25d366; color: white; border-color: #25d366; }
    .wl-btn-reserve:hover { background: #1ebe5a; }
  </style>
`;

const files = fs.readdirSync(THEMES_DIR).filter(f => f.endsWith('.html'));
let updated = 0;
for (const f of files) {
  const full = path.join(THEMES_DIR, f);
  let src = fs.readFileSync(full, 'utf8');
  if (src.includes(MARKER)) { console.log('skip:', f); continue; }

  // Inject CSS before </head>
  src = src.replace('</head>', `${CSS}\n</head>`);

  // Inject section before the existing registry-section if present, else before footer
  if (src.includes('id="registry-section"')) {
    src = src.replace('<section class="block" id="registry-section">', `${SECTION}\n<section class="block" id="registry-section">`);
  } else if (src.includes('<footer>')) {
    src = src.replace('<footer>', `${SECTION}\n<footer>`);
  } else {
    src = src.replace('</body>', `${SECTION}\n</body>`);
  }

  fs.writeFileSync(full, src);
  console.log('updated:', f);
  updated++;
}
console.log(`Done. ${updated} files updated.`);
