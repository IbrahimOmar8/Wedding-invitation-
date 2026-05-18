/**
 * Scheduled background jobs. Currently:
 *   - reminder.t7d: 7 days before the wedding, email every "yes" RSVP.
 *
 * The reminders_sent table is used as a per-invitation lockout so we
 * never send the same reminder twice.
 */
const cron = require('node-cron');
const db = require('./db');
const { send } = require('./email');
const sms = require('./sms');

const REMINDER_OFFSETS = [
  { kind: 'reminder.t7d', minHours: 6 * 24, maxHours: 8 * 24 },
];

function pickEvents() {
  return db.prepare(`
    SELECT i.id, i.groom_name, i.bride_name, i.wedding_date, i.venue_name,
           u.slug, u.email AS owner_email
    FROM invitations i JOIN users u ON u.id = i.user_id
    WHERE i.published = 1 AND i.wedding_date != '' AND i.wedding_date IS NOT NULL
  `).all();
}

async function runRemindersOnce() {
  const now = Date.now();
  const sentStmt = db.prepare('SELECT 1 FROM reminders_sent WHERE invitation_id = ? AND kind = ?');
  const markStmt = db.prepare('INSERT OR IGNORE INTO reminders_sent (invitation_id, kind) VALUES (?, ?)');

  for (const inv of pickEvents()) {
    const wed = new Date(inv.wedding_date).getTime();
    if (isNaN(wed)) continue;
    const hoursAway = (wed - now) / 3600000;
    if (hoursAway <= 0) continue;

    for (const r of REMINDER_OFFSETS) {
      if (hoursAway < r.minHours || hoursAway > r.maxHours) continue;
      if (sentStmt.get(inv.id, r.kind)) continue;

      const rsvpsEmail = db.prepare(`SELECT guest_name, guest_email FROM rsvps WHERE invitation_id = ? AND attending = 'yes' AND guest_email != ''`).all(inv.id);
      const guestsSms = db.prepare(`SELECT g.name, g.phone FROM guests g WHERE g.invitation_id = ? AND g.phone != ''`).all(inv.id);
      const url = `${process.env.PUBLIC_URL || 'http://localhost:3000'}/i/${inv.slug}`;
      const subject = `Reminder: ${inv.groom_name} & ${inv.bride_name}'s wedding is next week!`;
      const text = `Just a quick reminder — the wedding is coming up!\n\nWhere: ${inv.venue_name}\nWhen: ${new Date(inv.wedding_date).toLocaleString()}\n\nInvitation: ${url}\n\n— WedCard`;
      const smsText = `${inv.groom_name} & ${inv.bride_name}'s wedding is next week (${new Date(inv.wedding_date).toLocaleDateString()}). ${inv.venue_name}. ${url}`;

      for (const g of rsvpsEmail) await send({ to: g.guest_email, subject, text }).catch(() => {});
      for (const g of guestsSms) await sms.send(g.phone, smsText).catch(() => {});

      if (inv.owner_email) {
        await send({ to: inv.owner_email, subject: `[Reminder Sent] ${subject}`,
          text: `Sent reminders to ${rsvpsEmail.length} guests (email) and ${guestsSms.length} guests (SMS).\n${text}` }).catch(() => {});
      }
      markStmt.run(inv.id, r.kind);
      console.log(`[cron] sent ${r.kind}: ${rsvpsEmail.length} emails + ${guestsSms.length} SMS for invitation ${inv.id}`);
    }
  }
}

function start() {
  // Run every hour on the hour
  cron.schedule('5 * * * *', () => {
    runRemindersOnce().catch(e => console.error('[cron] error:', e.message));
  });
  console.log('[cron] reminder jobs scheduled (hourly)');
}

module.exports = { start, runRemindersOnce };
