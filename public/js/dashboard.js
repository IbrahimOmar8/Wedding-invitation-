// ─── Auth guard ───
const token = localStorage.getItem('wc_token');
if (!token) window.location.href = '/login';

const HEADERS = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
const UPLOAD_HEADERS = { 'Authorization': 'Bearer ' + token };

// ─── API helpers ───
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) } });
  if (r.status === 401) { localStorage.removeItem('wc_token'); window.location.href = '/login'; return; }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 2400);
}

// ─── Nav ───
document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.section;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById('section-' + id).classList.add('active');
    if (id === 'rsvps') loadRsvps();
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-backdrop').classList.remove('open');
  });
});

document.getElementById('signout-btn').addEventListener('click', () => {
  localStorage.removeItem('wc_token');
  localStorage.removeItem('wc_user');
  window.location.href = '/';
});

document.getElementById('menu-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
});
document.getElementById('sidebar-backdrop').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
});

// ─── State ───
let invitation = null;
let user = null;

function formatDateForInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderInvitation() {
  document.getElementById('groom_name').value = invitation.groom_name || '';
  document.getElementById('bride_name').value = invitation.bride_name || '';
  document.getElementById('wedding_date').value = formatDateForInput(invitation.wedding_date);
  document.getElementById('venue_name').value = invitation.venue_name || '';
  document.getElementById('venue_address').value = invitation.venue_address || '';
  document.getElementById('map_url').value = invitation.map_url || '';
  document.getElementById('quote').value = invitation.quote || '';
  document.getElementById('presence_text').value = invitation.presence_text || '';
  document.getElementById('published').value = invitation.published ? '1' : '0';
  document.getElementById('account-email').value = user.email;
  document.getElementById('account-slug').value = `${window.location.origin}/i/${user.slug}`;

  // Hero preview
  const heroPreview = document.getElementById('hero-preview');
  if (invitation.hero_image) {
    heroPreview.innerHTML = `<img src="${invitation.hero_image}" alt="cover">`;
  } else {
    heroPreview.innerHTML = '<div class="empty">No cover photo yet</div>';
  }

  // Gallery
  const grid = document.getElementById('gallery-grid');
  grid.innerHTML = '';
  (invitation.gallery_images || []).forEach(url => {
    const div = document.createElement('div');
    div.className = 'gallery-thumb';
    div.innerHTML = `<img src="${url}" alt="memory"><button class="remove" title="Remove">&times;</button>`;
    div.querySelector('.remove').addEventListener('click', () => removeFromGallery(url));
    grid.appendChild(div);
  });

  // Theme
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.theme === invitation.theme);
  });

  // Sidebar link
  document.getElementById('brand-link').innerHTML = `Your link: <a href="/i/${user.slug}" target="_blank">/i/${user.slug}</a>`;
  document.getElementById('preview-btn').href = `/i/${user.slug}`;
}

// ─── Load ───
async function load() {
  try {
    const data = await api('/api/invitation');
    invitation = data.invitation;
    user = data.user;
    renderInvitation();
  } catch (e) {
    toast(e.message, 'error');
  }
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
  } catch (ex) {
    toast(ex.message, 'error');
  } finally {
    e.target.disabled = false; e.target.textContent = 'Save Changes';
  }
});

// ─── Save settings ───
document.getElementById('save-settings').addEventListener('click', async (e) => {
  e.target.disabled = true; e.target.textContent = 'Saving...';
  try {
    const body = { published: parseInt(document.getElementById('published').value, 10) };
    const data = await api('/api/invitation', { method: 'PUT', body: JSON.stringify(body) });
    invitation = data.invitation;
    toast('Settings saved!');
  } catch (ex) {
    toast(ex.message, 'error');
  } finally {
    e.target.disabled = false; e.target.textContent = 'Save Changes';
  }
});

// ─── Theme selection ───
document.querySelectorAll('.theme-option').forEach(opt => {
  opt.addEventListener('click', async () => {
    const theme = opt.dataset.theme;
    try {
      const data = await api('/api/invitation', { method: 'PUT', body: JSON.stringify({ theme }) });
      invitation = data.invitation;
      document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      toast(`Theme changed to ${theme}!`);
    } catch (ex) {
      toast(ex.message, 'error');
    }
  });
});

// ─── Image uploads ───
async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch('/api/upload', { method: 'POST', headers: UPLOAD_HEADERS, body: fd });
  if (r.status === 401) { localStorage.removeItem('wc_token'); window.location.href = '/login'; return; }
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Upload failed');
  return data.url;
}

function bindUploader(uploaderEl, inputEl, onUrl) {
  inputEl.addEventListener('change', async () => {
    if (!inputEl.files[0]) return;
    try {
      uploaderEl.style.opacity = '0.6';
      const url = await uploadFile(inputEl.files[0]);
      await onUrl(url);
      toast('Uploaded!');
    } catch (ex) {
      toast(ex.message, 'error');
    } finally {
      uploaderEl.style.opacity = '';
      inputEl.value = '';
    }
  });
  // Drag and drop
  ['dragenter', 'dragover'].forEach(ev => uploaderEl.addEventListener(ev, e => { e.preventDefault(); uploaderEl.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => uploaderEl.addEventListener(ev, e => { e.preventDefault(); uploaderEl.classList.remove('dragover'); }));
  uploaderEl.addEventListener('drop', async (e) => {
    if (!e.dataTransfer.files[0]) return;
    try {
      uploaderEl.style.opacity = '0.6';
      const url = await uploadFile(e.dataTransfer.files[0]);
      await onUrl(url);
      toast('Uploaded!');
    } catch (ex) { toast(ex.message, 'error'); }
    finally { uploaderEl.style.opacity = ''; }
  });
}

bindUploader(
  document.getElementById('hero-uploader'),
  document.getElementById('hero-input'),
  async (url) => {
    const data = await api('/api/invitation', { method: 'PUT', body: JSON.stringify({ hero_image: url }) });
    invitation = data.invitation;
    renderInvitation();
  }
);

bindUploader(
  document.getElementById('gallery-uploader'),
  document.getElementById('gallery-input'),
  async (url) => {
    const data = await api('/api/invitation/gallery', { method: 'POST', body: JSON.stringify({ url }) });
    invitation.gallery_images = data.gallery_images;
    renderInvitation();
  }
);

async function removeFromGallery(url) {
  if (!confirm('Remove this photo from your gallery?')) return;
  try {
    const data = await api('/api/invitation/gallery', { method: 'DELETE', body: JSON.stringify({ url }) });
    invitation.gallery_images = data.gallery_images;
    renderInvitation();
    toast('Photo removed.');
  } catch (ex) { toast(ex.message, 'error'); }
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
      </tr>
    `).join('');
    tbody.querySelectorAll('button[data-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this reply?')) return;
        try { await api('/api/rsvp/' + btn.dataset.id, { method: 'DELETE' }); loadRsvps(); toast('Deleted.'); }
        catch (ex) { toast(ex.message, 'error'); }
      });
    });
  } catch (ex) { toast(ex.message, 'error'); }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

load();
