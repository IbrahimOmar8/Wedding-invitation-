/**
 * Premium subscription scaffold. Activates with STRIPE_SECRET_KEY +
 * STRIPE_PRICE_PREMIUM. Without those env vars, the endpoints return a
 * "not configured" response so the dashboard can hide the upgrade UI
 * cleanly. Free users keep all current features; premium would unlock
 * higher limits (more gallery photos, custom domain, etc.) — gating is
 * enforced via the `is_premium` column on users.
 */
const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');

// Add is_premium / stripe_customer_id columns
function addCol(table, col, type) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}
addCol('users', 'is_premium', 'INTEGER DEFAULT 0');
addCol('users', 'stripe_customer_id', 'TEXT');
addCol('users', 'stripe_subscription_id', 'TEXT');
addCol('users', 'premium_until', 'TEXT');

const router = express.Router();

let stripe = null;
function getStripe() {
  if (stripe) return stripe;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    const Stripe = require('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });
    return stripe;
  } catch (e) { console.warn('[billing] stripe not loaded:', e.message); return null; }
}

router.get('/status', authRequired, (req, res) => {
  const u = db.prepare('SELECT is_premium, premium_until, stripe_customer_id FROM users WHERE id = ?').get(req.user.id);
  res.json({
    is_premium: !!u?.is_premium,
    premium_until: u?.premium_until || null,
    configured: !!getStripe() && !!process.env.STRIPE_PRICE_PREMIUM,
  });
});

router.post('/checkout', authRequired, async (req, res) => {
  const s = getStripe();
  if (!s) return res.status(501).json({ error: 'Billing not configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_PREMIUM.' });
  const priceId = process.env.STRIPE_PRICE_PREMIUM;
  if (!priceId) return res.status(501).json({ error: 'STRIPE_PRICE_PREMIUM not set' });

  const u = db.prepare('SELECT email, stripe_customer_id FROM users WHERE id = ?').get(req.user.id);
  let customerId = u?.stripe_customer_id;
  if (!customerId) {
    const c = await s.customers.create({ email: u?.email || undefined, metadata: { wedcard_user_id: String(req.user.id) } });
    customerId = c.id;
    db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, req.user.id);
  }

  const successUrl = `${process.env.PUBLIC_URL || ''}/dashboard?billing=success`;
  const cancelUrl = `${process.env.PUBLIC_URL || ''}/dashboard?billing=cancel`;
  const session = await s.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl, cancel_url: cancelUrl,
  });
  res.json({ url: session.url });
});

router.post('/portal', authRequired, async (req, res) => {
  const s = getStripe();
  if (!s) return res.status(501).json({ error: 'Billing not configured' });
  const u = db.prepare('SELECT stripe_customer_id FROM users WHERE id = ?').get(req.user.id);
  if (!u?.stripe_customer_id) return res.status(404).json({ error: 'No Stripe customer found' });
  const portal = await s.billingPortal.sessions.create({
    customer: u.stripe_customer_id,
    return_url: `${process.env.PUBLIC_URL || ''}/dashboard`,
  });
  res.json({ url: portal.url });
});

// Webhook — Stripe POSTs events here when subscription state changes
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const s = getStripe();
  if (!s) return res.status(501).end();
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;
  try {
    event = secret ? s.webhooks.constructEvent(req.body, sig, secret) : JSON.parse(req.body.toString());
  } catch (err) { return res.status(400).send(`Webhook Error: ${err.message}`); }

  const setPremium = (customerId, isPremium, until = null) => {
    db.prepare('UPDATE users SET is_premium = ?, premium_until = ? WHERE stripe_customer_id = ?')
      .run(isPremium ? 1 : 0, until, customerId);
  };

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const active = ['active', 'trialing'].includes(sub.status);
      const until = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
      setPremium(sub.customer, active, until);
      db.prepare('UPDATE users SET stripe_subscription_id = ? WHERE stripe_customer_id = ?').run(sub.id, sub.customer);
      break;
    }
    case 'customer.subscription.deleted': {
      setPremium(event.data.object.customer, false, null);
      break;
    }
  }
  res.json({ received: true });
});

module.exports = router;
