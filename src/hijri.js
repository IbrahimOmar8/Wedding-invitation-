/**
 * Simple Gregorian → Hijri date conversion using the Umm al-Qura
 * algorithm (Kuwaiti algorithm). Good enough for display purposes on
 * wedding invitations (±1 day vs official sighting).
 *
 * Adapted from the standard astronomical algorithm.
 */

const MONTHS_AR = ['محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
const MONTHS_EN = ['Muharram','Safar','Rabi al-Awwal','Rabi al-Thani','Jumada al-Awwal','Jumada al-Thani','Rajab','Sha\'ban','Ramadan','Shawwal','Dhu al-Qi\'dah','Dhu al-Hijjah'];

function toHijri(gDate) {
  const d = new Date(gDate);
  if (isNaN(d.getTime())) return null;
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();

  // Julian day from Gregorian
  let jd;
  if ((year > 1582) || (year === 1582 && month > 10) || (year === 1582 && month === 10 && day > 14)) {
    jd = Math.floor((1461 * (year + 4800 + Math.floor((month - 14) / 12))) / 4)
       + Math.floor((367 * (month - 2 - 12 * Math.floor((month - 14) / 12))) / 12)
       - Math.floor((3 * Math.floor((year + 4900 + Math.floor((month - 14) / 12)) / 100)) / 4)
       + day - 32075;
  } else {
    jd = 367 * year - Math.floor((7 * (year + 5001 + Math.floor((month - 9) / 7))) / 4)
       + Math.floor((275 * month) / 9) + day + 1729777;
  }

  // Julian day to Hijri (Kuwaiti algorithm)
  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j = (Math.floor((10985 - l2) / 5316)) * (Math.floor((50 * l2) / 17719))
          + (Math.floor(l2 / 5670)) * (Math.floor((43 * l2) / 15238));
  const l3 = l2 - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50))
              - (Math.floor(j / 16)) * (Math.floor((15238 * j) / 43)) + 29;
  const hMonth = Math.floor((24 * l3) / 709);
  const hDay = l3 - Math.floor((709 * hMonth) / 24);
  const hYear = 30 * n + j - 30;

  return { day: hDay, month: hMonth, year: hYear };
}

function formatHijri(gDate, lang = 'en') {
  const h = toHijri(gDate);
  if (!h) return '';
  const months = lang === 'ar' ? MONTHS_AR : MONTHS_EN;
  const suffix = lang === 'ar' ? 'هـ' : 'AH';
  return `${h.day} ${months[h.month - 1]} ${h.year} ${suffix}`;
}

module.exports = { toHijri, formatHijri };
