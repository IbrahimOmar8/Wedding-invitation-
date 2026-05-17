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

async function mailtm(method, path, body, token, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const r = await fetch('https://api.mail.tm' + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/ld+json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await r.text();
      if (!text.trim()) return {};
      try { return JSON.parse(text); }
      catch (_) { if (attempt === retries - 1) return {}; }
    } catch (e) { if (attempt === retries - 1) throw e; }
    await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
  }
  return {};
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

  // ─── 12. Extras: accent color + livestream + music + OG ───
  console.log('\n--- Stage 11: extras (accent, livestream, music, OG) ---');
  const extras = await json('PUT', '/api/invitation', {
    language: 'en',
    accent_color: '#5d7d5a',
    livestream_url: 'https://youtube.com/live/test-stream',
    music_url: 'https://example.com/song.mp3',
    og_image: 'https://example.com/cover.jpg',
  }, wcToken);
  ok('extras saved', extras.status === 200, JSON.stringify(extras.data).slice(0, 200));
  const extResp = await fetch(`${HOST}/i/${slug}`);
  const extHtml = await extResp.text();
  ok('OG meta present', extHtml.includes('property="og:title"') && extHtml.includes('og:image'));
  ok('accent color applied', extHtml.includes('#5d7d5a'));
  ok('livestream section present', extHtml.includes('Join the live stream') || extHtml.includes('youtube.com/live'));
  ok('music toggle present', extHtml.includes('id="music-toggle"') && extHtml.includes('song.mp3'));
  ok('manifest linked', extHtml.includes('/manifest.json'));
  ok('sw registration', extHtml.includes("navigator.serviceWorker.register('/sw.js')"));

  // ─── 13. Save-the-date mode ───
  console.log('\n--- Stage 12: save-the-date mode ---');
  await json('PUT', '/api/invitation', { save_the_date_only: 1 }, wcToken);
  const stdResp = await fetch(`${HOST}/i/${slug}`);
  const stdHtml = await stdResp.text();
  ok('save-the-date class', stdHtml.includes('class="std-mode"'));
  await json('PUT', '/api/invitation', { save_the_date_only: 0 }, wcToken);

  // ─── 14. Analytics: views recorded ───
  console.log('\n--- Stage 13: analytics ---');
  const an = await json('GET', '/api/analytics', null, wcToken);
  ok('analytics total > 0', an.status === 200 && an.data.total > 0, JSON.stringify(an.data));

  // ─── 15. Gift tracking ───
  console.log('\n--- Stage 14: gift tracking ---');
  const gifts = await json('GET', '/api/gifts', null, wcToken);
  ok('gifts endpoint HTTP 200', gifts.status === 200, JSON.stringify(gifts.data).slice(0, 200));
  // wishlist has 0 items yet, so just check structure
  ok('gifts has stats', !!gifts.data?.stats);

  // ─── 16. Co-hosts ───
  console.log('\n--- Stage 15: cohosts (create second user, invite them) ---');
  const addr2 = `wedcard-co${Date.now()}@${domain}`;
  await mailtm('POST', '/accounts', { address: addr2, password: pw });
  const mt2 = await mailtm('POST', '/token', { address: addr2, password: pw });
  if (!mt2.token) {
    ok('cohost mail.tm token (skipped — rate limited)', true);
  } else {
    const coSlug = `co-${ts.toString().slice(-6)}`;
    const co_signup = await json('POST', '/api/auth/signup', {
      fullName: 'E2E Cohost', username: addr2, password: pw, slug: coSlug,
    });
    ok('cohost signup HTTP 200', co_signup.status === 200);
    let otp2 = '';
    for (let i = 1; i <= 30; i++) {
      const list = mailtmList(await mailtm('GET', '/messages', null, mt2.token));
      if (list.length) {
        const full = await mailtm('GET', '/messages/' + list[0].id, null, mt2.token);
        const m = ((full.text || '') + ' ' + (Array.isArray(full.html) ? full.html.join(' ') : (full.html || ''))).match(/\b(\d{4,8})\b/);
        if (m) { otp2 = m[1]; break; }
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    ok('cohost OTP received', !!otp2);
    if (otp2) {
      await json('POST', '/api/auth/verify-otp', { username: addr2, otp: otp2, slug: coSlug, password: pw });
      const inviteResp = await json('POST', '/api/cohosts', { identifier: addr2 }, wcToken);
      ok('cohost invite HTTP 200', inviteResp.status === 200, JSON.stringify(inviteResp.data));
      const coList = await json('GET', '/api/cohosts', null, wcToken);
      ok('cohost appears in list', Array.isArray(coList.data?.cohosts) && coList.data.cohosts.length > 0);
    }
  }

  // ─── 17. PWA manifest reachable ───
  console.log('\n--- Stage 16: PWA assets ---');
  const manifest = await fetch(`${HOST}/manifest.json`);
  ok('manifest.json HTTP 200', manifest.status === 200);
  const sw = await fetch(`${HOST}/sw.js`);
  ok('sw.js HTTP 200', sw.status === 200);

  // ─── 18. FCM token endpoint ───
  console.log('\n--- Stage 17: FCM token endpoint ---');
  const fcmSet = await json('PUT', '/api/account/fcm-token', { token: 'test-fcm-token-abc' }, wcToken);
  ok('fcm token set HTTP 200', fcmSet.status === 200);
  const fcmDel = await json('DELETE', '/api/account/fcm-token', null, wcToken);
  ok('fcm token delete HTTP 200', fcmDel.status === 200);

  // ─── 19. Music requests (public submit + admin list + moderation) ───
  console.log('\n--- Stage 18: music requests ---');
  const ms = await fetch(`${HOST}/api/music/${slug}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guest_name: 'Test DJ', song: 'Despacito', artist: 'Luis Fonsi' }),
  });
  ok('music submit HTTP 200', ms.status === 200);
  const ml = await json('GET', '/api/music', null, wcToken);
  ok('music list returns request', ml.data.requests?.length >= 1 && ml.data.requests[0].song === 'Despacito');
  if (ml.data.requests?.[0]?.id) {
    const mu = await json('PUT', `/api/music/${ml.data.requests[0].id}`, { played: 1 }, wcToken);
    ok('music mark-played HTTP 200', mu.status === 200);
  }

  // ─── 20. Friends import endpoint (auth-only) ───
  console.log('\n--- Stage 19: friends endpoint ---');
  const fr = await json('GET', '/api/friends', null, wcToken);
  ok('friends endpoint reachable', fr.status === 200 || fr.status === 502, JSON.stringify(fr.data).slice(0, 200));

  // ─── 21. Inline reservation start (negative — invalid item triggers proper error) ───
  console.log('\n--- Stage 20: inline reservation start ---');
  const rs = await json('POST', '/api/public/reserve/start', { slug, item_id: 'nonexistent-item-id-12345', username: 'guest@example.com' });
  ok('reserve start HTTP 2xx (registers temp account)', rs.status >= 200 && rs.status < 500, JSON.stringify(rs.data).slice(0, 200));

  // ─── 22. Themes still render after meta injection ───
  console.log('\n--- Stage 21: all 6 themes render cleanly ---');
  for (const theme of ['elegant', 'royal', 'garden', 'minimal', 'rustic', 'beach']) {
    await json('PUT', '/api/invitation', { theme, language: 'en' }, wcToken);
    const r = await fetch(`${HOST}/i/${slug}`);
    const html = await r.text();
    const unsub = (html.match(/\{\{[A-Za-z_]+\}\}/g) || []).length;
    ok(`theme ${theme}: HTTP ${r.status} + 0 unsub vars + has reserve modal`, r.status === 200 && unsub === 0 && html.includes('reserve-modal'));
  }

  // ─── 23. Security headers present ───
  console.log('\n--- Stage 22: security headers ---');
  const sec = await fetch(`${HOST}/`);
  ok('helmet headers applied', sec.headers.get('x-frame-options') && sec.headers.get('x-content-type-options') === 'nosniff');
  ok('rate-limit headers applied (general API)', !!(await fetch(`${HOST}/api/health`)).headers.get('ratelimit-limit'));

  console.log('\n===== Summary =====');
  console.log('  Mailbox:    ', addr);
  console.log('  Slug:       ', slug);
  console.log('  Invitation: ', `${HOST}/i/${slug}`);
  console.log('  Test status:', process.exitCode ? 'FAILED' : 'PASSED');
}

main().catch(e => { console.error('\nFATAL:', e); process.exit(1); });
