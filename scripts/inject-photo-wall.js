/**
 * Add a guest photo-wall + Hijri date line to every theme.
 * Idempotent via marker `<!-- PW -->`.
 */
const fs = require('fs');
const path = require('path');

const THEMES_DIR = path.join(__dirname, '..', 'views', 'themes');
const MARKER = '<!-- PW -->';

const STYLE = `
  <style>
    .photo-wall-section { padding: 4rem 1.5rem; }
    .photo-wall-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.6rem; max-width: 1100px; margin: 2rem auto 0; }
    .pw-photo { aspect-ratio: 1; overflow: hidden; border-radius: 8px; position: relative; }
    .pw-photo img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s; cursor: pointer; }
    .pw-photo:hover img { transform: scale(1.05); }
    .pw-photo .cap { position: absolute; bottom: 0; left: 0; right: 0; padding: 0.5rem 0.7rem; background: linear-gradient(transparent, rgba(0,0,0,0.7)); color: #fff; font-size: 0.78rem; }
    .pw-upload { max-width: 480px; margin: 1.5rem auto 0; padding: 1.5rem; background: rgba(255,255,255,0.7); border-radius: 10px; }
    .pw-upload label { display: block; font-size: 0.7rem; letter-spacing: 0.25em; text-transform: uppercase; opacity: 0.7; margin: 0.6rem 0 0.3rem; }
    .pw-upload input[type=text], .pw-upload input[type=file] { width: 100%; padding: 0.6rem 0.8rem; border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; background: rgba(255,255,255,0.9); font-family: inherit; font-size: 0.95rem; }
    .pw-upload button { margin-top: 0.8rem; padding: 0.7rem 1.4rem; border: none; background: currentColor; color: #fff; cursor: pointer; font-family: inherit; font-size: 0.75rem; letter-spacing: 0.25em; text-transform: uppercase; border-radius: 6px; }
    .hijri-line { display: block; font-size: 0.9rem; opacity: 0.75; font-style: italic; margin-top: 0.3rem; }
    .gg-table { display: block; margin-top: 0.6rem; padding-top: 0.6rem; border-top: 1px dashed currentColor; opacity: 0.85; }
  </style>
`;

const SECTION = `
${MARKER}
<section class="block photo-wall-section" id="photo-wall-section">
  <div class="center"><p class="label">Memories from You</p><h2 class="title">Photo Wall</h2></div>
  <div class="photo-wall-grid" id="pw-grid"></div>
  <form class="pw-upload" id="pw-upload" enctype="multipart/form-data">
    <label>Your Name</label>
    <input type="text" name="guest_name" required maxlength="120">
    <label>Caption (optional)</label>
    <input type="text" name="caption" maxlength="300" placeholder="A line about the moment…">
    <label>Photo</label>
    <input type="file" name="file" accept="image/*" required>
    <button type="submit">Share Your Photo</button>
    <div class="ok-msg" id="pw-ok"></div>
  </form>
</section>
`;

const SCRIPT = `
<script>
(function() {
  const SLUG = '{{SLUG}}';
  const grid = document.getElementById('pw-grid');
  const form = document.getElementById('pw-upload');
  const sec = document.getElementById('photo-wall-section');
  if (!grid || !form) return;

  async function load() {
    try {
      const r = await fetch('/api/guest-photos/' + SLUG);
      if (!r.ok) { sec.style.display='none'; return; }
      const { photos } = await r.json();
      if (!photos || !photos.length) {
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;opacity:0.6;padding:2rem 0">No photos yet — be the first to share!</p>';
        return;
      }
      grid.innerHTML = photos.map(p => \`
        <div class="pw-photo">
          <img src="\${p.url}" alt="\${p.caption || ''}" loading="lazy">
          \${p.caption ? '<div class="cap">' + p.caption.replace(/[<>]/g,'') + '</div>' : ''}
        </div>\`).join('');
    } catch (_) { sec.style.display='none'; }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const r = await fetch('/api/guest-photos/' + SLUG, { method: 'POST', body: fd });
      const data = await r.json();
      const ok = document.getElementById('pw-ok');
      if (r.ok) {
        ok.textContent = data.message || 'Thanks!';
        ok.style.display = 'block';
        form.reset();
        setTimeout(() => { ok.style.display = 'none'; }, 5000);
      } else {
        alert(data.error || 'Upload failed');
      }
    } finally { btn.disabled = false; }
  });

  load();
})();
</script>
`;

const files = fs.readdirSync(THEMES_DIR).filter(f => f.endsWith('.html'));
let updated = 0;
for (const f of files) {
  const full = path.join(THEMES_DIR, f);
  let src = fs.readFileSync(full, 'utf8');
  if (src.includes(MARKER)) { console.log('skip:', f); continue; }
  src = src.replace('</head>', STYLE + '\n</head>');
  if (src.includes('<footer>')) {
    src = src.replace('<footer>', SECTION + '\n<footer>');
  } else {
    src = src.replace('</body>', SECTION + '\n</body>');
  }
  src = src.replace('</body>', SCRIPT + '\n</body>');
  // Insert Hijri date next to save-date if there's a placeholder hook
  if (src.includes('{{DATE_LONG}}') && src.includes('save-date')) {
    src = src.replace(/(<p class="save-date">[^<]*<\/p>)/, '$1<span class="hijri-line">{{HIJRI_DATE}}</span>');
  }
  fs.writeFileSync(full, src);
  console.log('updated:', f);
  updated++;
}
console.log(`Done. ${updated} themes updated.`);
