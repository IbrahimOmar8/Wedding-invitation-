/**
 * Add the reduced-motion toggle button + persistence script to every theme.
 * Idempotent via marker `<!-- MOT -->`.
 */
const fs = require('fs');
const path = require('path');

const THEMES_DIR = path.join(__dirname, '..', 'views', 'themes');
const MARKER = '<!-- MOT -->';

const BUTTON_AND_SCRIPT = `
${MARKER}
<button id="motion-toggle" type="button" aria-label="Toggle reduced motion" title="Toggle reduced motion">⊘</button>
<script>
(function() {
  const KEY = 'wc-reduced-motion';
  const btn = document.getElementById('motion-toggle');
  if (!btn) return;
  const body = document.body;

  function apply(on) {
    body.classList.toggle('reduced-motion', !!on);
    btn.classList.toggle('on', !!on);
    btn.textContent = on ? '◉' : '⊘';
    btn.setAttribute('aria-pressed', String(!!on));
  }

  // Restore previous user choice or honor the OS preference
  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch (_) {}
  if (stored !== null) {
    apply(stored === '1');
  } else if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply(true);
  }

  btn.addEventListener('click', () => {
    const next = !body.classList.contains('reduced-motion');
    apply(next);
    try { localStorage.setItem(KEY, next ? '1' : '0'); } catch (_) {}
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
  src = src.replace('</body>', BUTTON_AND_SCRIPT + '\n</body>');
  fs.writeFileSync(full, src);
  console.log('updated:', f);
  updated++;
}
console.log(`Done. ${updated} themes updated.`);
