/**
 * End-to-end test against the LIVE wish-listy backend via a real OTP
 * received through mail.tm. Intended to be run manually — not in CI.
 *
 *  WEDCARD_URL=http://localhost:3000 node scripts/e2e-test.js
 */

const HOST = process.env.WEDCARD_URL || 'http://localhost:3000';

async function json(method, path, body, token, baseUrl = HOST) {
  const r = await fetch(baseUrl + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch (_) { data = { _raw: text }; }
  return { status: r.status, data };
}

async function mailtm(method, path, body, token) {
  const r = await fetch('https://api.mail.tm' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/ld+json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return await r.json();
}

function mailtmList(resp) {
  if (Array.isArray(resp)) return resp;
  if (resp && Array.isArray(resp['hydra:member'])) return resp['hydra:member'];
  return [];
}

function ok(label, cond, extra = '') { console.log(`${cond ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`); if (!cond) process.exitCode = 1; }

async function main() {
  console.log('===== WedCard ↔ Wish Listy E2E test =====\n');

  // ─── 1. Create temp mailbox ───
  const domains = await mailtm('GET', '/domains?page=1');
  const domain = mailtmList(domains)[0]?.domain;
  if (!domain) throw new Error('No mail.tm domain available');
  const ts = Date.now();
  const addr = `wedcard${ts}@${domain}`;
  const pw = 'TestPass123!';
  const slug = `e2e-${ts.toString().slice(-6)}`;

  console.log('Test mailbox:', addr);
  console.log('Test slug:   ', slug, '\n');

  await mailtm('POST', '/accounts', { address: addr, password: pw });
  const mt = await mailtm('POST', '/token', { address: addr, password: pw });
  const mailToken = mt.token;
  ok('mail.tm token obtained', !!mailToken);

  // ─── 2. WedCard signup ───
  console.log('\n--- Stage 1: signup (proxies to wish-listy) ---');
  const signup = await json('POST', '/api/auth/signup', {
    fullName: 'E2E Test Couple',
    username: addr,
    password: pw,
    slug,
  });
  ok('signup HTTP 200', signup.status === 200, JSON.stringify(signup.data));
  ok('signup requires OTP', signup.data.requiresOtp === true);

  // ─── 3. Poll mailbox ───
  console.log('\n--- Stage 2: wait for OTP email ---');
  let otp = '';
  let msgPreview = '';
  for (let i = 1; i <= 30; i++) {
    const msgs = await mailtm('GET', '/messages', null, mailToken);
    const list = mailtmList(msgs);
    if (list.length) {
      const full = await mailtm('GET', '/messages/' + list[0].id, null, mailToken);
      const body = (full.text || '') + ' ' + (Array.isArray(full.html) ? full.html.join(' ') : (full.html || ''));
      const match = body.match(/\b(\d{4,8})\b/);
      if (match) otp = match[1];
      msgPreview = (full.subject || '(no subject)') + ' | ' + body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
      break;
    }
    process.stdout.write(`  poll #${i} (no mail yet)\r`);
    await new Promise(r => setTimeout(r, 2000));
  }
  ok('email received', !!msgPreview, msgPreview);
  ok('OTP extracted', !!otp, otp);
  if (!otp) return;

  // ─── 4. Verify OTP ───
  console.log('\n--- Stage 3: verify OTP, get WedCard JWT ---');
  const verify = await json('POST', '/api/auth/verify-otp', {
    username: addr, otp, slug, password: pw,
  });
  ok('verify-otp HTTP 200', verify.status === 200, JSON.stringify(verify.data).slice(0, 200));
  const wcToken = verify.data.token;
  ok('WedCard JWT issued', !!wcToken);
  if (!wcToken) return;

  // ─── 5. Auth check ───
  console.log('\n--- Stage 4: /api/auth/me + wish-listy status ---');
  const me = await json('GET', '/api/auth/me', null, wcToken);
  ok('me HTTP 200', me.status === 200, JSON.stringify(me.data));
  ok('wishlisty_user_id stored', !!me.data.user?.wishlisty_user_id);

  const status = await json('GET', '/api/wishlisty/_status', null, wcToken);
  ok('wishlisty _status HTTP 200', status.status === 200, JSON.stringify(status.data));
  ok('connected = true', status.data.connected === true);
  ok('has_token = true', status.data.has_token === true);

  // ─── 6. List wishlists ───
  console.log('\n--- Stage 5: list wishlists from wish-listy ---');
  const lists = await json('GET', '/api/wishlisty', null, wcToken);
  ok('list wishlists HTTP 200', lists.status === 200, JSON.stringify(lists.data).slice(0, 200));

  // ─── 7. Create a wedding wishlist via WedCard proxy ───
  console.log('\n--- Stage 6: create wishlist via WedCard proxy ---');
  const created = await json('POST', '/api/wishlisty', {
    name: 'Our Wedding Wishlist (E2E)',
    description: 'Items for the big day',
    privacy: 'public',
    category: 'wedding',
  }, wcToken);
  ok('create wishlist HTTP 2xx', created.status >= 200 && created.status < 300, JSON.stringify(created.data).slice(0, 200));
  const wl = created.data?.data?.wishlist || created.data?.wishlist || created.data?.data || created.data;
  const wishlistId = wl?._id || wl?.id;
  ok('wishlist id returned', !!wishlistId, wishlistId);

  // ─── 8. Select it as registry ───
  console.log('\n--- Stage 7: link wishlist to invitation ---');
  if (wishlistId) {
    const sel = await json('POST', '/api/wishlisty/select', { wishlist_id: wishlistId }, wcToken);
    ok('select wishlist HTTP 200', sel.status === 200, JSON.stringify(sel.data));
  }

  // ─── 9. Update invitation (triggers wish-listy Event sync) ───
  console.log('\n--- Stage 8: save wedding details (auto-creates wish-listy Event) ---');
  const futureDate = new Date(Date.now() + 90 * 86400000); // 90 days from now
  const yyyy = futureDate.getUTCFullYear(), mm = String(futureDate.getUTCMonth() + 1).padStart(2,'0'), dd = String(futureDate.getUTCDate()).padStart(2,'0');
  const upd = await json('PUT', '/api/invitation', {
    groom_name: 'Ibrahim', bride_name: 'Omnia',
    wedding_date: `${yyyy}-${mm}-${dd}T14:30`,
    venue_name: 'Al-Safa Hall', venue_address: 'Cairo, Egypt',
    map_url: 'https://maps.app.goo.gl/yY1K4cECvcZReEBH7',
    theme: 'elegant', language: 'en',
  }, wcToken);
  ok('save details HTTP 200', upd.status === 200, JSON.stringify(upd.data).slice(0, 200));

  // Give the background Event sync a couple of seconds
  await new Promise(r => setTimeout(r, 3000));
  const status2 = await json('GET', '/api/wishlisty/_status', null, wcToken);
  ok('event linked to wish-listy', status2.data.has_event === true, JSON.stringify(status2.data));

  // ─── 10. Render the invitation publicly ───
  console.log('\n--- Stage 9: render public invitation ---');
  const r = await fetch(`${HOST}/i/${slug}`);
  const html = await r.text();
  ok('public render HTTP 200', r.status === 200);
  ok('rendered with names', html.includes('Ibrahim') && html.includes('Omnia'));
  ok('rendered with venue', html.includes('Al-Safa Hall'));
  ok('Wish Listy section present', html.includes('wishlisty-registry-section'));

  // ─── 11. Switch to Arabic, render again ───
  console.log('\n--- Stage 10: switch to Arabic + verify RTL ---');
  await json('PUT', '/api/invitation', { language: 'ar' }, wcToken);
  const arResp = await fetch(`${HOST}/i/${slug}`);
  const arHtml = await arResp.text();
  ok('Arabic render', arHtml.includes('dir="rtl"') && /(احفظ|دعوة|تفاصيل)/.test(arHtml));

  console.log('\n===== Summary =====');
  console.log('  Mailbox:    ', addr);
  console.log('  Slug:       ', slug);
  console.log('  Invitation: ', `${HOST}/i/${slug}`);
  console.log('  Test status:', process.exitCode ? 'FAILED' : 'PASSED');
}

main().catch(e => { console.error('\nFATAL:', e); process.exit(1); });
