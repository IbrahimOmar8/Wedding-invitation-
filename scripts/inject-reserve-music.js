/**
 * Add the inline reservation modal + music request form to every theme.
 * Idempotent via marker `<!-- RES -->`.
 */
const fs = require('fs');
const path = require('path');

const THEMES_DIR = path.join(__dirname, '..', 'views', 'themes');
const MARKER = '<!-- RES -->';

const STYLE = `
  <style>
    .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: none; align-items: center; justify-content: center; z-index: 2000; padding: 1rem; }
    .modal.open { display: flex; }
    .modal-card { background: #fff; color: #2d2a24; max-width: 420px; width: 100%; border-radius: 12px; padding: 1.8rem; box-shadow: 0 20px 60px rgba(0,0,0,0.3); font-family: 'Cormorant Garamond', Georgia, serif; }
    .modal-card h3 { font-size: 1.4rem; margin-bottom: 0.4rem; }
    .modal-card p.modal-desc { color: #6b6354; margin-bottom: 1rem; font-size: 0.95rem; }
    .modal-card label { display: block; font-size: 0.7rem; letter-spacing: 0.2em; text-transform: uppercase; color: #8a6620; margin: 0.8rem 0 0.3rem; }
    .modal-card input { width: 100%; padding: 0.7rem 0.9rem; border: 1px solid #ece4d4; border-radius: 6px; background: #faf6ef; font-family: inherit; font-size: 1rem; }
    .modal-card .btn-row { display: flex; gap: 0.6rem; margin-top: 1.2rem; }
    .modal-card .btn-row button { flex: 1; padding: 0.8rem; border: none; border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 0.8rem; letter-spacing: 0.15em; text-transform: uppercase; }
    .modal-card .btn-primary { background: #b78a3a; color: #fff; }
    .modal-card .btn-primary:hover { background: #8a6620; }
    .modal-card .btn-secondary { background: transparent; color: #6b6354; border: 1px solid #ece4d4; }
    .modal-card .err { color: #c84a4a; font-size: 0.9rem; min-height: 1.2rem; margin-top: 0.3rem; }
    .modal-card .ok { color: #2d6e3f; font-size: 0.95rem; padding: 0.8rem; background: #e8f3ea; border-radius: 6px; text-align: center; font-style: italic; }
  </style>
`;

const MODAL = `
<div class="modal" id="reserve-modal">
  <div class="modal-card" data-stage="start">
    <h3 id="rm-title">Reserve this gift</h3>
    <p class="modal-desc" id="rm-desc">Enter your email or phone. We'll send a one-time code to confirm.</p>
    <div data-step="start">
      <label>Email or Phone</label>
      <input type="text" id="rm-username" autocomplete="username">
      <label style="display:none" id="rm-pw-label">Password</label>
      <input type="password" id="rm-password" autocomplete="current-password" style="display:none">
      <div class="err" id="rm-err"></div>
      <div class="btn-row">
        <button type="button" class="btn-secondary" id="rm-cancel">Cancel</button>
        <button type="button" class="btn-primary" id="rm-start">Continue</button>
      </div>
    </div>
    <div data-step="otp" style="display:none">
      <p class="modal-desc">We sent a 6-digit code to <strong id="rm-target"></strong>.</p>
      <label>Verification Code</label>
      <input type="text" id="rm-otp" inputmode="numeric" maxlength="8" style="letter-spacing:0.4em;text-align:center;font-size:1.2rem">
      <div class="err" id="rm-err2"></div>
      <div class="btn-row">
        <button type="button" class="btn-secondary" id="rm-back">Back</button>
        <button type="button" class="btn-primary" id="rm-verify">Reserve</button>
      </div>
    </div>
    <div data-step="done" style="display:none">
      <div class="ok">✓ Reserved! The couple has been notified anonymously.</div>
      <div class="btn-row">
        <button type="button" class="btn-primary" id="rm-close">Close</button>
      </div>
    </div>
  </div>
</div>

<section class="block" id="music-section">
  <div class="center"><p class="label">Songs</p><h2 class="title">Request a Song for the Party</h2></div>
  <form class="wish-form" id="music-form" style="max-width:480px;margin:1.5rem auto 0">
    <label>Your Name</label>
    <input type="text" name="guest_name" required maxlength="120">
    <label>Song</label>
    <input type="text" name="song" required maxlength="200">
    <label>Artist (optional)</label>
    <input type="text" name="artist" maxlength="160">
    <label>Note (optional)</label>
    <input type="text" name="note" maxlength="300" placeholder="e.g. for the first dance">
    <button type="submit">Send Request</button>
    <div class="ok-msg" id="music-ok">Thank you! The song has been added to the queue.</div>
  </form>
</section>
`;

const SCRIPT = `
<script>
(function() {
  const SLUG = '{{SLUG}}';

  // Intercept clicks on "Reserve via Wish Listy" links and open the modal
  function bindReserveLinks() {
    document.querySelectorAll('a.wl-btn-reserve').forEach(a => {
      if (a.dataset.bound) return;
      a.dataset.bound = '1';
      a.addEventListener('click', e => {
        const url = new URL(a.href, location.href);
        const itemId = url.searchParams.get('reserve') || a.dataset.itemId;
        if (!itemId) return;
        e.preventDefault();
        openReserve(itemId);
      });
    });
  }

  const modal = document.getElementById('reserve-modal');
  if (!modal) return;
  let state = { itemId: null, reserveToken: null };

  function show(step) {
    modal.querySelectorAll('[data-step]').forEach(el => el.style.display = el.dataset.step === step ? '' : 'none');
  }
  function openReserve(itemId) {
    state = { itemId, reserveToken: null };
    document.getElementById('rm-username').value = '';
    document.getElementById('rm-password').value = '';
    document.getElementById('rm-password').style.display = 'none';
    document.getElementById('rm-pw-label').style.display = 'none';
    document.getElementById('rm-otp').value = '';
    document.getElementById('rm-err').textContent = '';
    document.getElementById('rm-err2').textContent = '';
    show('start');
    modal.classList.add('open');
  }
  function closeReserve() { modal.classList.remove('open'); }

  document.getElementById('rm-cancel').onclick = closeReserve;
  document.getElementById('rm-close').onclick = closeReserve;
  document.getElementById('rm-back').onclick = () => show('start');

  document.getElementById('rm-start').onclick = async () => {
    const username = document.getElementById('rm-username').value.trim();
    if (!username) return;
    const password = document.getElementById('rm-password').value;
    const err = document.getElementById('rm-err');
    err.textContent = '';
    const btn = document.getElementById('rm-start');
    btn.disabled = true; const oldText = btn.textContent; btn.textContent = '…';
    try {
      const r = await fetch('/api/public/reserve/start', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ slug: SLUG, item_id: state.itemId, username, password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      if (data.requiresPassword) {
        document.getElementById('rm-password').style.display = '';
        document.getElementById('rm-pw-label').style.display = '';
        err.textContent = 'Enter your existing Wish Listy password.';
        return;
      }
      state.reserveToken = data.reserve_token;
      if (data.ready) {
        await doVerify();
      } else {
        document.getElementById('rm-target').textContent = username;
        show('otp');
      }
    } catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; btn.textContent = oldText; }
  };

  async function doVerify() {
    const err = document.getElementById('rm-err2');
    err.textContent = '';
    const btn = document.getElementById('rm-verify');
    btn.disabled = true;
    try {
      const r = await fetch('/api/public/reserve/verify', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ reserve_token: state.reserveToken, otp: document.getElementById('rm-otp').value.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Reservation failed');
      show('done');
    } catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; }
  }

  document.getElementById('rm-verify').onclick = doVerify;

  bindReserveLinks();
  new MutationObserver(bindReserveLinks).observe(document.body, { childList: true, subtree: true });

  // Music form
  const mf = document.getElementById('music-form');
  if (mf) {
    mf.addEventListener('submit', async e => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      const r = await fetch('/api/music/' + SLUG, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if (r.ok) { document.getElementById('music-ok').style.display='block'; e.target.querySelector('button').disabled = true; }
      else { alert('Could not send the request.'); }
    });
  }
})();
</script>
`;

const files = fs.readdirSync(THEMES_DIR).filter(f => f.endsWith('.html'));
let updated = 0;
for (const f of files) {
  const full = path.join(THEMES_DIR, f);
  let src = fs.readFileSync(full, 'utf8');
  if (src.includes(MARKER)) { console.log('skip:', f); continue; }
  src = src.replace('</head>', STYLE + `\n${MARKER}\n</head>`);
  if (src.includes('<footer>')) {
    src = src.replace('<footer>', MODAL + '\n<footer>');
  } else {
    src = src.replace('</body>', MODAL + '\n</body>');
  }
  src = src.replace('</body>', SCRIPT + '\n</body>');
  fs.writeFileSync(full, src);
  console.log('updated:', f);
  updated++;
}
console.log(`Done. ${updated} themes updated.`);
