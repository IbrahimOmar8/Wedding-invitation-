/**
 * One-time onboarding wizard shown to brand-new users after signup.
 * Stores completion in localStorage so it doesn't reappear.
 */
(function() {
  const KEY = 'wc_onboarded';
  if (localStorage.getItem(KEY) === '1') return;

  const lang = localStorage.getItem('wc_ui_lang') || 'en';
  const T = lang === 'ar' ? {
    welcome: 'مرحباً بك في WedCard! 🎉',
    intro: 'هندك دعوة جاهزة بشكل افتراضي. خلينا نخصصها في 4 خطوات سريعة.',
    s1: 'املأ تفاصيل الفرح',
    s1d: 'الأسماء، التاريخ، والمكان من تبويب "التفاصيل".',
    s2: 'ارفع صورة الغلاف',
    s2d: 'من تبويب "الصور" — هتظهر في رأس الدعوة.',
    s3: 'اختر القالب واللغة',
    s3d: '6 قوالب جاهزة، عربي أو إنجليزي.',
    s4: 'شارك مع ضيوفك',
    s4d: 'انسخ الرابط أو ولّد QR من تبويب "الضيوف".',
    skip: 'تخطّي', start: 'يلا نبدأ',
  } : {
    welcome: 'Welcome to WedCard! 🎉',
    intro: 'You have a default invitation ready. Let\'s customize it in 4 quick steps.',
    s1: 'Fill in the wedding details',
    s1d: 'Names, date, and venue under the "Details" tab.',
    s2: 'Upload a cover photo',
    s2d: 'From the "Images" tab — it shows up at the top of your invitation.',
    s3: 'Pick a theme and language',
    s3d: '6 ready themes, English or Arabic.',
    s4: 'Share with your guests',
    s4d: 'Copy the link or generate a QR from the "Guests" tab.',
    skip: 'Skip', start: 'Let\'s start',
  };

  const html = `
    <div id="wc-onboard" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:3000;padding:1rem">
      <div style="background:#fff;max-width:520px;width:100%;border-radius:16px;padding:2rem;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:inherit;text-align:start" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
        <h2 style="font-size:1.6rem;margin-bottom:0.4rem;font-style:italic;color:#2d2a24">${T.welcome}</h2>
        <p style="color:#6b6354;margin-bottom:1.5rem">${T.intro}</p>
        <ol style="list-style:none;padding:0;margin:0">
          ${[1,2,3,4].map(n => `
            <li style="display:flex;gap:0.9rem;padding:0.8rem 0;border-top:1px solid #ece4d4">
              <div style="flex:0 0 32px;height:32px;border-radius:50%;background:#b78a3a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600">${n}</div>
              <div style="flex:1">
                <div style="font-weight:500;color:#2d2a24">${T['s'+n]}</div>
                <div style="color:#6b6354;font-size:0.92rem;margin-top:0.2rem">${T['s'+n+'d']}</div>
              </div>
            </li>`).join('')}
        </ol>
        <div style="display:flex;gap:0.5rem;margin-top:1.5rem">
          <button id="wc-onboard-skip" style="flex:1;padding:0.8rem;border:1px solid #ece4d4;background:#fff;color:#6b6354;border-radius:6px;cursor:pointer;font-family:inherit">${T.skip}</button>
          <button id="wc-onboard-start" style="flex:2;padding:0.8rem;border:none;background:#b78a3a;color:#fff;border-radius:6px;cursor:pointer;font-family:inherit;font-weight:500">${T.start}</button>
        </div>
      </div>
    </div>
  `;

  function show() {
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);
    const close = () => {
      const el = document.getElementById('wc-onboard');
      if (el) el.remove();
      localStorage.setItem(KEY, '1');
    };
    document.getElementById('wc-onboard-skip').onclick = close;
    document.getElementById('wc-onboard-start').onclick = () => {
      close();
      // jump to details tab
      document.querySelector('.nav-item[data-section="details"]')?.click();
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
  else setTimeout(show, 400);
})();
