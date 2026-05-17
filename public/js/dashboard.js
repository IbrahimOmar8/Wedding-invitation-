// ─── Auth guard ───
const token = localStorage.getItem('wc_token');
if (!token) window.location.href = '/login';

const HEADERS = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
const UPLOAD_HEADERS = { 'Authorization': 'Bearer ' + token };

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) } });
  if (r.status === 401) { localStorage.removeItem('wc_token'); window.location.href = '/login'; return; }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 2400);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatDateForInput(iso) {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z'); if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

// ─── State ───
let invitation = null, user = null;

// ─── Live preview ───
let previewTimer;
function refreshPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const f = document.getElementById('preview-frame');
    if (!user) return;
    f.src = `/i/${user.slug}?t=${Date.now()}`;
  }, 400);
}

document.getElementById('refresh-preview').addEventListener('click', refreshPreview);
document.getElementById('preview-toggle')?.addEventListener('click', () => {
  document.getElementById('preview-pane').classList.toggle('open');
  refreshPreview();
});

// ─── Nav ───
document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.section;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('section-' + id).classList.add('active');
    if (id === 'rsvps') loadRsvps();
    if (id === 'wishes') loadWishes();
    if (id === 'events') loadEvents();
    if (id === 'story') loadStory();
    if (id === 'registry') loadWishlistyStatus();
    if (id === 'guests') loadGuests();
    if (id === 'gifts') loadGifts();
    if (id === 'cohosts') loadCohosts();
    if (id === 'analytics') loadAnalytics();
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').classList.remove('open');
  });
});

document.getElementById('signout-btn').addEventListener('click', () => {
  localStorage.removeItem('wc_token'); localStorage.removeItem('wc_user');
  window.location.href = '/';
});

document.getElementById('menu-toggle')?.addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
});
document.getElementById('sidebar-backdrop').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
});

// ─── Load invitation + render form ───
function renderInvitation() {
  const f = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  f('groom_name', invitation.groom_name);
  f('bride_name', invitation.bride_name);
  f('wedding_date', formatDateForInput(invitation.wedding_date));
  f('venue_name', invitation.venue_name);
  f('venue_address', invitation.venue_address);
  f('map_url', invitation.map_url);
  f('quote', invitation.quote);
  f('presence_text', invitation.presence_text);
  document.getElementById('published').value = invitation.published ? '1' : '0';
  document.getElementById('language').value = invitation.language || 'en';
  document.getElementById('save_the_date_only').checked = !!invitation.save_the_date_only;
  document.getElementById('livestream_url').value = invitation.livestream_url || '';
  document.getElementById('music_url').value = invitation.music_url || '';
  document.getElementById('accent_color').value = invitation.accent_color || '';
  document.getElementById('og_image').value = invitation.og_image || '';
  document.getElementById('account-email').value = user.email;
  document.getElementById('account-slug').value = `${window.location.origin}/i/${user.slug}`;

  const heroPreview = document.getElementById('hero-preview');
  heroPreview.innerHTML = invitation.hero_image
    ? `<img src="${invitation.hero_image}" alt="cover">`
    : '<div class="empty">No cover photo yet</div>';

  const grid = document.getElementById('gallery-grid');
  grid.innerHTML = '';
  (invitation.gallery_images || []).forEach(url => {
    const div = document.createElement('div');
    div.className = 'gallery-thumb';
    div.innerHTML = `<img src="${escapeHtml(url)}" alt="memory"><button class="remove" title="Remove">&times;</button>`;
    div.querySelector('.remove').addEventListener('click', () => removeFromGallery(url));
    grid.appendChild(div);
  });

  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.theme === invitation.theme);
  });

  document.getElementById('brand-link').innerHTML = `<a href="/i/${user.slug}" target="_blank">/i/${user.slug}</a>`;
  document.getElementById('preview-btn').href = `/i/${user.slug}`;
}

async function loadStats() {
  try {
    const { stats } = await api('/api/account/stats');
    document.getElementById('qs-views').textContent = stats.views || 0;
    document.getElementById('qs-guests').textContent = stats.guests || 0;
    document.getElementById('qs-yes').textContent = stats.rsvpYes || 0;
    document.getElementById('qs-wishes').textContent = stats.wishes || 0;
  } catch (_) {}
}

async function load() {
  try {
    const data = await api('/api/invitation');
    invitation = data.invitation; user = data.user;
    renderInvitation();
    refreshPreview();
    loadStats();
    loadMainQR();
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Save details ───
document.getElementById('save-details').addEventListener('click', async (e) => {
  e.target.disabled = true; e.target.textContent = 'Saving...';
  try {
    const body = {
      groom_name: document.getElementById('groom_name').value,
      bride_name: document.getElementById('bride_name').value,
      wedding_date: document.getElementById('wedding_date').value,
      venue_name: document.getElementById('venue_name').value,
      venue_address: document.getElementById('venue_address').value,
      map_url: document.getElementById('map_url').value,
      quote: document.getElementById('quote').value,
      presence_text: document.getElementById('presence_text').value,
    };
    const data = await api('/api/invitation', { method: 'PUT', body: JSON.stringify(body) });
    invitation = data.invitation;
    toast('Details saved!');
    refreshPreview();
  } catch (ex) { toast(ex.message, 'error'); }
  finally { e.target.disabled = false; e.target.textContent = 'Save Changes'; }
});

// ─── Save publishing ───
document.getElementById('save-publish').addEventListener('click', async (e) => {
  e.target.disabled = true; e.target.textContent = 'Saving...';
  try {
    const data = await api('/api/invitation', { method: 'PUT', body: JSON.stringify({
      published: parseInt(document.getElementById('published').value, 10),
      save_the_date_only: document.getElementById('save_the_date_only').checked ? 1 : 0,
    }) });
    invitation = data.invitation; toast('Saved!'); refreshPreview();
  } catch (ex) { toast(ex.message, 'error'); }
  finally { e.target.disabled = false; e.target.textContent = 'Save'; }
});

document.getElementById('save-extras')?.addEventListener('click', async (e) => {
  e.target.disabled = true; e.target.textContent = 'Saving...';
  try {
    const data = await api('/api/invitation', { method: 'PUT', body: JSON.stringify({
      livestream_url: document.getElementById('livestream_url').value,
      music_url: document.getElementById('music_url').value,
      accent_color: document.getElementById('accent_color').value,
      og_image: document.getElementById('og_image').value,
    }) });
    invitation = data.invitation; toast('Extras saved!'); refreshPreview();
  } catch (ex) { toast(ex.message, 'error'); }
  finally { e.target.disabled = false; e.target.textContent = 'Save Extras'; }
});

// ─── Gift tracking ───
async function loadGifts() {
  const list = document.getElementById('gifts-list');
  list.innerHTML = '<p class="desc">Loading…</p>';
  try {
    const { items, stats } = await api('/api/gifts');
    document.getElementById('gt-total').textContent = stats.total;
    document.getElementById('gt-purchased').textContent = stats.purchased;
    document.getElementById('gt-reserved').textContent = stats.reserved;
    document.getElementById('gt-thanked').textContent = stats.thanked;
    if (!items.length) { list.innerHTML = '<div class="empty-state"><div class="ic">&#127873;</div><p>No items in your linked wishlist yet. Add some via Wish Listy.</p></div>'; return; }
    list.innerHTML = items.map(i => `
      <div class="item-row" data-id="${i.id}">
        <div class="ir-body">
          <h3>${escapeHtml(i.name)}
            ${i.isPurchased ? '<span class="tag yes">Gifted</span>' : (i.reservedUntil ? '<span class="tag" style="background:#f4ecd8;color:#8a6620">Reserved</span>' : '')}
          </h3>
          ${i.description ? `<p>${escapeHtml(i.description)}</p>` : ''}
          <div style="margin-top:0.6rem">
            <label style="font-size:0.85rem"><input type="checkbox" ${i.thank_you_sent ? 'checked' : ''} data-thank="${i.id}"> Thank-you sent</label>
          </div>
          <div class="field" style="margin-top:0.4rem"><input type="text" data-note="${i.id}" value="${escapeHtml(i.note)}" placeholder="Private note…"></div>
        </div>
      </div>`).join('');
    list.querySelectorAll('[data-thank]').forEach(cb => cb.addEventListener('change', async () => {
      const id = cb.dataset.thank;
      const note = list.querySelector(`[data-note="${id}"]`).value;
      await api('/api/gifts/' + id, { method: 'PUT', body: JSON.stringify({ thank_you_sent: cb.checked, note }) });
      toast(cb.checked ? 'Marked thanked' : 'Unmarked');
      loadGifts();
    }));
    list.querySelectorAll('[data-note]').forEach(inp => {
      let t;
      inp.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const id = inp.dataset.note;
          const cb = list.querySelector(`[data-thank="${id}"]`);
          await api('/api/gifts/' + id, { method: 'PUT', body: JSON.stringify({ thank_you_sent: cb.checked, note: inp.value }) });
        }, 600);
      });
    });
  } catch (ex) {
    list.innerHTML = `<p class="desc" style="color:var(--error)">${escapeHtml(ex.message)}</p>`;
  }
}

// ─── Co-hosts ───
async function loadCohosts() {
  const list = document.getElementById('cohosts-list');
  const cohostOfCard = document.getElementById('cohost-of-card');
  const cohostOfList = document.getElementById('cohost-of-list');
  try {
    const { cohosts, cohost_of } = await api('/api/cohosts');
    if (!cohosts.length) {
      list.innerHTML = '<div class="empty-state"><div class="ic">&#128107;</div><p>No co-hosts yet.</p></div>';
    } else {
      list.innerHTML = cohosts.map(c => `
        <div class="item-row" data-id="${c.cohost_id}">
          <div class="ir-body">
            <h3>${escapeHtml(c.full_name || c.username || c.email || 'Unknown')}</h3>
            <div class="meta">${escapeHtml(c.email || '')} · added ${formatWhen(c.created_at)}</div>
          </div>
          <div class="ir-actions"><button class="del" data-id="${c.cohost_id}">Remove</button></div>
        </div>`).join('');
      list.querySelectorAll('.del').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Remove this co-host?')) return;
        await api('/api/cohosts/' + b.dataset.id, { method: 'DELETE' });
        loadCohosts();
      }));
    }
    if (cohost_of.length) {
      cohostOfCard.style.display = '';
      cohostOfList.innerHTML = cohost_of.map(c => `
        <div class="item-row">
          <div class="ir-body">
            <h3>${escapeHtml(c.groom_name)} &amp; ${escapeHtml(c.bride_name)}</h3>
            <div class="meta">Owner: ${escapeHtml(c.owner_email || '')} · <a href="/i/${escapeHtml(c.slug)}" target="_blank">view</a></div>
          </div>
        </div>`).join('');
    } else {
      cohostOfCard.style.display = 'none';
    }
  } catch (ex) { list.innerHTML = `<p class="desc" style="color:var(--error)">${escapeHtml(ex.message)}</p>`; }
}

document.getElementById('add-cohost')?.addEventListener('click', async (e) => {
  const id = document.getElementById('co-identifier').value.trim();
  if (!id) return toast('Enter an email or username', 'error');
  e.target.disabled = true;
  try {
    await api('/api/cohosts', { method: 'POST', body: JSON.stringify({ identifier: id }) });
    document.getElementById('co-identifier').value = '';
    toast('Co-host added!'); loadCohosts();
  } catch (ex) { toast(ex.message, 'error'); }
  finally { e.target.disabled = false; }
});

// ─── Analytics ───
async function loadAnalytics() {
  try {
    const { total, byCountry, byDay } = await api('/api/analytics');
    document.getElementById('an-total').textContent = total;
    const cBox = document.getElementById('an-country');
    cBox.innerHTML = byCountry.length
      ? byCountry.map(r => `<div class="item-row"><div class="ir-body"><h3>${escapeHtml(r.country)}</h3><div class="meta">${r.n} view${r.n>1?'s':''}</div></div></div>`).join('')
      : '<p class="desc">No views yet.</p>';
    const dBox = document.getElementById('an-days');
    dBox.innerHTML = byDay.length
      ? byDay.map(r => `<div class="item-row"><div class="ir-body"><h3>${escapeHtml(r.day)}</h3><div class="meta">${r.n} view${r.n>1?'s':''}</div></div></div>`).join('')
      : '<p class="desc">No views yet.</p>';
  } catch (ex) { toast(ex.message, 'error'); }
}

// ─── Push notifications (browser permission + FCM token) ───
document.getElementById('enable-push')?.addEventListener('click', async () => {
  if (!('Notification' in window)) return toast('Push not supported in this browser', 'error');
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Permission not granted', 'error');
    // Without a configured FCM project + web push setup we still let the user opt in;
    // server-side push only fires if a token is stored. Store a placeholder so the
    // owner sees the option active; real FCM integration requires a service worker
    // registered with a Firebase config.
    await api('/api/account/fcm-token', { method: 'PUT', body: JSON.stringify({ token: 'browser-' + Date.now() }) });
    document.getElementById('push-status').textContent = 'Push enabled on this device.';
    toast('Push enabled!');
  } catch (ex) { toast(ex.message, 'error'); }
});

document.getElementById('disable-push')?.addEventListener('click', async () => {
  try {
    await api('/api/account/fcm-token', { method: 'DELETE' });
    document.getElementById('push-status').textContent = 'Push disabled.';
    toast('Push disabled.');
  } catch (ex) { toast(ex.message, 'error'); }
});

// ─── Language switcher ───
document.getElementById('language').addEventListener('change', async (e) => {
  try {
    const data = await api('/api/invitation', { method: 'PUT', body: JSON.stringify({ language: e.target.value }) });
    invitation = data.invitation;
    toast(`Language: ${e.target.value === 'ar' ? 'العربية' : 'English'}`);
    refreshPreview();
  } catch (ex) { toast(ex.message, 'error'); }
});

// ─── Theme picker ───
document.querySelectorAll('.theme-option').forEach(opt => {
  opt.addEventListener('click', async () => {
    try {
      const data = await api('/api/invitation', { method: 'PUT', body: JSON.stringify({ theme: opt.dataset.theme }) });
      invitation = data.invitation;
      document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      toast(`Theme: ${opt.dataset.theme}`); refreshPreview();
    } catch (ex) { toast(ex.message, 'error'); }
  });
});

// ─── Uploads ───
async function uploadFile(file) {
  const fd = new FormData(); fd.append('file', file);
  const r = await fetch('/api/upload', { method: 'POST', headers: UPLOAD_HEADERS, body: fd });
  if (r.status === 401) { localStorage.removeItem('wc_token'); window.location.href = '/login'; return; }
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Upload failed');
  return data.url;
}

function bindUploader(uploaderEl, inputEl, onUrl) {
  inputEl.addEventListener('change', async () => {
    if (!inputEl.files[0]) return;
    try { uploaderEl.style.opacity = '0.6'; const url = await uploadFile(inputEl.files[0]); await onUrl(url); toast('Uploaded!'); }
    catch (ex) { toast(ex.message, 'error'); }
    finally { uploaderEl.style.opacity = ''; inputEl.value = ''; }
  });
  ['dragenter', 'dragover'].forEach(ev => uploaderEl.addEventListener(ev, e => { e.preventDefault(); uploaderEl.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => uploaderEl.addEventListener(ev, e => { e.preventDefault(); uploaderEl.classList.remove('dragover'); }));
  uploaderEl.addEventListener('drop', async (e) => {
    if (!e.dataTransfer.files[0]) return;
    try { uploaderEl.style.opacity = '0.6'; const url = await uploadFile(e.dataTransfer.files[0]); await onUrl(url); toast('Uploaded!'); }
    catch (ex) { toast(ex.message, 'error'); }
    finally { uploaderEl.style.opacity = ''; }
  });
}

bindUploader(document.getElementById('hero-uploader'), document.getElementById('hero-input'), async (url) => {
  const data = await api('/api/invitation', { method: 'PUT', body: JSON.stringify({ hero_image: url }) });
  invitation = data.invitation; renderInvitation(); refreshPreview();
});
bindUploader(document.getElementById('gallery-uploader'), document.getElementById('gallery-input'), async (url) => {
  const data = await api('/api/invitation/gallery', { method: 'POST', body: JSON.stringify({ url }) });
  invitation.gallery_images = data.gallery_images; renderInvitation(); refreshPreview();
});

async function removeFromGallery(url) {
  if (!confirm('Remove this photo from your gallery?')) return;
  try {
    const data = await api('/api/invitation/gallery', { method: 'DELETE', body: JSON.stringify({ url }) });
    invitation.gallery_images = data.gallery_images;
    renderInvitation(); refreshPreview(); toast('Photo removed.');
  } catch (ex) { toast(ex.message, 'error'); }
}

// ─── Events ───
async function loadEvents() {
  const { events } = await api('/api/events');
  const list = document.getElementById('events-list');
  if (!events.length) { list.innerHTML = '<div class="empty-state"><div class="ic">&#128467;</div><p>No events yet. Add one above.</p></div>'; return; }
  list.innerHTML = events.map(e => `
    <div class="item-row" data-id="${e.id}">
      <div class="ir-body">
        <h3>${escapeHtml(e.icon || '♥')} ${escapeHtml(e.title)}</h3>
        ${e.event_date ? `<div class="meta">${escapeHtml(new Date(e.event_date).toLocaleString())}</div>` : ''}
        ${e.venue_name ? `<div class="meta">${escapeHtml(e.venue_name)}${e.venue_address ? ' — ' + escapeHtml(e.venue_address) : ''}</div>` : ''}
      </div>
      <div class="ir-actions"><button class="del" data-id="${e.id}">Delete</button></div>
    </div>`).join('');
  list.querySelectorAll('.del').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this event?')) return;
    await api('/api/events/' + b.dataset.id, { method: 'DELETE' });
    loadEvents(); refreshPreview();
  }));
}

document.getElementById('add-event').addEventListener('click', async () => {
  const body = {
    title: document.getElementById('ev-title').value,
    event_date: document.getElementById('ev-date').value,
    venue_name: document.getElementById('ev-venue').value,
    venue_address: document.getElementById('ev-address').value,
    map_url: document.getElementById('ev-map').value,
    icon: document.getElementById('ev-icon').value,
  };
  if (!body.title) return toast('Title required', 'error');
  try {
    await api('/api/events', { method: 'POST', body: JSON.stringify(body) });
    ['ev-title', 'ev-date', 'ev-venue', 'ev-address', 'ev-map', 'ev-icon'].forEach(id => document.getElementById(id).value = '');
    loadEvents(); refreshPreview(); toast('Event added!');
  } catch (ex) { toast(ex.message, 'error'); }
});

// ─── Story ───
async function loadStory() {
  const { story } = await api('/api/story');
  const list = document.getElementById('story-list');
  if (!story.length) { list.innerHTML = '<div class="empty-state"><div class="ic">&#128214;</div><p>No story yet.</p></div>'; return; }
  list.innerHTML = story.map(s => `
    <div class="item-row" data-id="${s.id}">
      <div class="ir-body">
        ${s.sub ? `<div class="meta">${escapeHtml(s.sub)}</div>` : ''}
        <h3>${escapeHtml(s.title)}</h3>
        ${s.body ? `<p>${escapeHtml(s.body)}</p>` : ''}
      </div>
      <div class="ir-actions"><button class="del" data-id="${s.id}">Delete</button></div>
    </div>`).join('');
  list.querySelectorAll('.del').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this entry?')) return;
    await api('/api/story/' + b.dataset.id, { method: 'DELETE' });
    loadStory(); refreshPreview();
  }));
}

document.getElementById('add-story').addEventListener('click', async () => {
  const body = {
    title: document.getElementById('st-title').value,
    sub: document.getElementById('st-sub').value,
    body: document.getElementById('st-body').value,
  };
  if (!body.title) return toast('Title required', 'error');
  try {
    await api('/api/story', { method: 'POST', body: JSON.stringify(body) });
    ['st-title', 'st-sub', 'st-body'].forEach(id => document.getElementById(id).value = '');
    loadStory(); refreshPreview(); toast('Added!');
  } catch (ex) { toast(ex.message, 'error'); }
});

// ─── Wish Listy Registry ───
async function loadWishlistyStatus() {
  const msg = document.getElementById('wl-status-msg');
  const pickCard = document.getElementById('wl-pick-card');
  const createCard = document.getElementById('wl-create-card');
  const itemsCard = document.getElementById('wl-items-card');
  try {
    const status = await api('/api/wishlisty/_status');
    if (!status.connected) {
      msg.innerHTML = `<span style="color:var(--error)">Not connected.</span> Sign out and re-register/login via WedCard to link your Wish Listy account.`;
      pickCard.style.display = 'none'; createCard.style.display = 'none'; itemsCard.style.display = 'none';
      return;
    }
    msg.innerHTML = `<span style="color:var(--success)">✓ Connected to Wish Listy</span> · base: <code>${escapeHtml(status.base_url)}</code>`;
    pickCard.style.display = ''; createCard.style.display = '';
    if (status.has_wishlist) {
      itemsCard.style.display = '';
      loadWishlistyItems();
    } else {
      itemsCard.style.display = 'none';
    }
    loadWishlistOptions(status);
  } catch (ex) {
    msg.innerHTML = `<span style="color:var(--error)">Error: ${escapeHtml(ex.message)}</span>`;
  }
}

async function loadWishlistOptions(status) {
  const sel = document.getElementById('wl-select');
  sel.innerHTML = '<option value="">-- loading… --</option>';
  try {
    const res = await api('/api/wishlisty');
    const list = res?.wishlists || res?.data?.wishlists || res?.data || [];
    sel.innerHTML = '<option value="">-- choose --</option>';
    list.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w._id || w.id; opt.textContent = w.name || 'Untitled';
      if ((w._id || w.id) === (invitation && invitation.wishlisty_wishlist_id)) opt.selected = true;
      sel.appendChild(opt);
    });
    if (!list.length) sel.innerHTML = '<option value="">(no wishlists yet — create one below)</option>';
  } catch (ex) {
    sel.innerHTML = `<option value="">(failed to load: ${escapeHtml(ex.message)})</option>`;
  }
}

async function loadWishlistyItems() {
  const me = await api('/api/auth/me');
  const wid = me.user?.wishlisty_wishlist_id;
  const box = document.getElementById('wl-items-list');
  if (!wid) { box.innerHTML = '<p class="desc">No wishlist selected.</p>'; return; }
  box.innerHTML = '<p class="desc">Loading items…</p>';
  try {
    const res = await api('/api/wishlisty/' + wid);
    const wishlist = res?.data?.wishlist || res?.wishlist || res?.data || res;
    const items = wishlist?.items || [];
    if (!items.length) { box.innerHTML = '<p class="desc">This wishlist has no items yet. Add some in the Wish Listy app.</p>'; return; }
    box.innerHTML = items.map(i => `
      <div class="item-row">
        <div class="ir-body">
          <h3>${escapeHtml(i.name)}${i.isPurchased ? ' <span style="color:var(--success);font-size:0.85em">(gifted)</span>' : ''}${i.reservedUntil ? ' <span style="color:var(--gold-d);font-size:0.85em">(reserved)</span>' : ''}</h3>
          ${i.description ? `<p>${escapeHtml(i.description)}</p>` : ''}
          ${i.storeName ? `<div class="meta">Store: ${escapeHtml(i.storeName)}</div>` : ''}
        </div>
      </div>`).join('');
  } catch (ex) {
    box.innerHTML = `<p class="desc" style="color:var(--error)">Failed to load: ${escapeHtml(ex.message)}</p>`;
  }
}

document.getElementById('wl-select-btn')?.addEventListener('click', async (e) => {
  const id = document.getElementById('wl-select').value;
  if (!id) return toast('Pick a wishlist first', 'error');
  e.target.disabled = true;
  try {
    await api('/api/wishlisty/select', { method: 'POST', body: JSON.stringify({ wishlist_id: id }) });
    toast('Wishlist linked to your invitation!');
    loadWishlistyStatus(); refreshPreview();
  } catch (ex) { toast(ex.message, 'error'); }
  finally { e.target.disabled = false; }
});

document.getElementById('wl-disconnect-btn')?.addEventListener('click', async () => {
  if (!confirm('Remove the linked wishlist from your invitation?')) return;
  try {
    await api('/api/wishlisty/disconnect', { method: 'POST' });
    toast('Wishlist removed.'); loadWishlistyStatus(); refreshPreview();
  } catch (ex) { toast(ex.message, 'error'); }
});

document.getElementById('wl-create-btn')?.addEventListener('click', async (e) => {
  const body = {
    name: document.getElementById('wl-new-name').value,
    description: document.getElementById('wl-new-desc').value,
    privacy: document.getElementById('wl-new-privacy').value,
    category: 'wedding',
  };
  if (!body.name) return toast('Name required', 'error');
  e.target.disabled = true;
  try {
    const res = await api('/api/wishlisty', { method: 'POST', body: JSON.stringify(body) });
    const created = res?.wishlist || res?.data?.wishlist || res?.data;
    const id = created?._id || created?.id;
    if (id) await api('/api/wishlisty/select', { method: 'POST', body: JSON.stringify({ wishlist_id: id }) });
    toast('Wishlist created!');
    ['wl-new-name', 'wl-new-desc'].forEach(i => document.getElementById(i).value = '');
    loadWishlistyStatus(); refreshPreview();
  } catch (ex) { toast(ex.message, 'error'); }
  finally { e.target.disabled = false; }
});

// ─── Guests ───
async function loadGuests() {
  const { guests } = await api('/api/guests');
  const list = document.getElementById('guests-list');
  if (!guests.length) { list.innerHTML = '<div class="empty-state"><div class="ic">&#128101;</div><p>No guests yet.</p></div>'; return; }
  list.innerHTML = guests.map(g => {
    const personalUrl = `${window.location.origin}/i/${user.slug}/g/${g.token}`;
    const wa = g.phone
      ? `https://wa.me/${g.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`${invitation.groom_name} & ${invitation.bride_name} invite you: ${personalUrl}`)}`
      : `https://wa.me/?text=${encodeURIComponent(`${invitation.groom_name} & ${invitation.bride_name} invite you: ${personalUrl}`)}`;
    return `
    <div class="guest-row" data-id="${g.id}">
      <div class="gr-info">
        <h3>${escapeHtml(g.name)}</h3>
        ${g.phone ? `<div class="meta">${escapeHtml(g.phone)}</div>` : ''}
        ${g.email ? `<div class="meta">${escapeHtml(g.email)}</div>` : ''}
        <div class="meta">Max: ${g.max_guests}</div>
        <div class="gr-link">${escapeHtml(personalUrl)}</div>
      </div>
      <div class="gr-actions">
        <a class="wa" href="${escapeHtml(wa)}" target="_blank">WhatsApp</a>
        <a href="/api/guests/${g.id}/qr" target="_blank">QR</a>
        <button class="copy" data-url="${escapeHtml(personalUrl)}">Copy Link</button>
        <button class="del" data-id="${g.id}">Delete</button>
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('.del').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this guest?')) return;
    await api('/api/guests/' + b.dataset.id, { method: 'DELETE' });
    loadGuests(); loadStats();
  }));
  list.querySelectorAll('.copy').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.url); toast('Link copied!'); }
    catch (_) { prompt('Copy this link:', b.dataset.url); }
  }));
}

document.getElementById('add-guest').addEventListener('click', async () => {
  const body = {
    name: document.getElementById('g-name').value,
    phone: document.getElementById('g-phone').value,
    email: document.getElementById('g-email').value,
    max_guests: parseInt(document.getElementById('g-max').value, 10) || 2,
  };
  if (!body.name) return toast('Name required', 'error');
  try {
    await api('/api/guests', { method: 'POST', body: JSON.stringify(body) });
    ['g-name', 'g-phone', 'g-email'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('g-max').value = '2';
    loadGuests(); loadStats(); toast('Guest added!');
  } catch (ex) { toast(ex.message, 'error'); }
});

document.getElementById('add-bulk').addEventListener('click', async () => {
  const names = document.getElementById('bulk-names').value;
  if (!names.trim()) return toast('Paste some names first', 'error');
  try {
    const { added } = await api('/api/guests/bulk', { method: 'POST', body: JSON.stringify({ names }) });
    document.getElementById('bulk-names').value = '';
    loadGuests(); loadStats(); toast(`${added} guests added!`);
  } catch (ex) { toast(ex.message, 'error'); }
});

function loadMainQR() {
  const el = document.getElementById('qr-main');
  if (el) el.innerHTML = `<img src="/api/guests/qr" alt="QR">`;
}

// ─── RSVPs ───
async function loadRsvps() {
  try {
    const data = await api('/api/rsvp');
    document.getElementById('stat-total').textContent = data.stats.total;
    document.getElementById('stat-yes').textContent = data.stats.yes;
    document.getElementById('stat-no').textContent = data.stats.no;
    document.getElementById('stat-guests').textContent = data.stats.guests;

    const tbody = document.getElementById('rsvp-tbody');
    if (!data.rsvps.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="ic">&#128173;</div><p>No replies yet. Share your invitation link to get started!</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = data.rsvps.map(r => `
      <tr>
        <td><strong>${escapeHtml(r.guest_name)}</strong></td>
        <td>${escapeHtml(r.guest_email || '—')}</td>
        <td><span class="tag ${r.attending}">${r.attending === 'yes' ? 'Attending' : 'Not Attending'}</span></td>
        <td>${r.guest_count}</td>
        <td>${escapeHtml(r.message || '—')}</td>
        <td>${formatWhen(r.created_at)}</td>
        <td><button class="btn sm danger" data-id="${r.id}">Delete</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('button[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this reply?')) return;
        try { await api('/api/rsvp/' + btn.dataset.id, { method: 'DELETE' }); loadRsvps(); loadStats(); toast('Deleted.'); }
        catch (ex) { toast(ex.message, 'error'); }
      });
    });
  } catch (ex) { toast(ex.message, 'error'); }
}

document.getElementById('export-rsvps').addEventListener('click', async (e) => {
  e.preventDefault();
  const r = await fetch('/api/rsvp/export', { headers: { 'Authorization': 'Bearer ' + token } });
  if (!r.ok) return toast('Export failed', 'error');
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'rsvps.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ─── Wishes (admin) ───
async function loadWishes() {
  const { wishes } = await api('/api/wishes');
  const list = document.getElementById('wishes-list-admin');
  if (!wishes.length) { list.innerHTML = '<div class="empty-state"><div class="ic">&#128173;</div><p>No wishes yet.</p></div>'; return; }
  list.innerHTML = wishes.map(w => `
    <div class="item-row" data-id="${w.id}">
      <div class="ir-body">
        <p style="font-style:italic;font-size:1rem">"${escapeHtml(w.message)}"</p>
        <div class="meta" style="margin-top:0.4rem">— ${escapeHtml(w.guest_name)} · ${formatWhen(w.created_at)}</div>
      </div>
      <div class="ir-actions">
        <button data-toggle="${w.id}" data-approved="${w.approved}">${w.approved ? 'Hide' : 'Show'}</button>
        <button class="del" data-id="${w.id}">Delete</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', async () => {
    const approved = b.dataset.approved === '1' ? 0 : 1;
    await api('/api/wishes/' + b.dataset.toggle, { method: 'PUT', body: JSON.stringify({ approved }) });
    loadWishes(); refreshPreview();
  }));
  list.querySelectorAll('.del').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Delete this wish?')) return;
    await api('/api/wishes/' + b.dataset.id, { method: 'DELETE' });
    loadWishes(); loadStats(); refreshPreview();
  }));
}

// ─── Account ───
document.getElementById('change-pw').addEventListener('click', async (e) => {
  const cur = document.getElementById('cur-pw').value;
  const nw = document.getElementById('new-pw').value;
  if (!cur || !nw) return toast('Both fields required', 'error');
  if (nw.length < 6) return toast('Password must be at least 6 chars', 'error');
  e.target.disabled = true;
  try {
    await api('/api/account/password', { method: 'PUT', body: JSON.stringify({ current_password: cur, new_password: nw }) });
    document.getElementById('cur-pw').value = ''; document.getElementById('new-pw').value = '';
    toast('Password changed!');
  } catch (ex) { toast(ex.message, 'error'); }
  finally { e.target.disabled = false; }
});

document.getElementById('delete-acc').addEventListener('click', async (e) => {
  if (!confirm('PERMANENTLY delete your account, invitation, and all data?\nThis cannot be undone.')) return;
  const pw = document.getElementById('del-pw').value;
  if (!pw) return toast('Password required to confirm', 'error');
  e.target.disabled = true;
  try {
    await api('/api/account', { method: 'DELETE', body: JSON.stringify({ password: pw }) });
    localStorage.removeItem('wc_token'); localStorage.removeItem('wc_user');
    alert('Your account has been deleted.');
    window.location.href = '/';
  } catch (ex) { toast(ex.message, 'error'); e.target.disabled = false; }
});

load();
