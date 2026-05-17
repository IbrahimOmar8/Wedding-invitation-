const nodemailer = require('nodemailer');

let transporter = null;
let configured = false;

function init() {
  if (configured) return;
  configured = true;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: SMTP_SECURE === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
}

async function send({ to, subject, text, html }) {
  init();
  const from = process.env.MAIL_FROM || 'WedCard <no-reply@wedcard.app>';
  if (!transporter) {
    console.log('[email:dev]', { to, subject, text: text?.slice(0, 200) });
    return { dev: true };
  }
  try {
    return await transporter.sendMail({ from, to, subject, text, html });
  } catch (e) {
    console.error('[email:error]', e.message);
    return { error: e.message };
  }
}

module.exports = { send };
