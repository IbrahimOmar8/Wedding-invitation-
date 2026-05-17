/**
 * Aggregated stats for the invitation owner. Page views are written
 * by server.js's renderInvitation; here we read them back grouped
 * by country and by day.
 */
const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');
const { getAccessibleInvitation } = require('../access');

const router = express.Router();

router.get('/', authRequired, (req, res) => {
  const a = getAccessibleInvitation(req.user.id);
  if (!a) return res.json({ total: 0, byCountry: [], byDay: [] });
  const total = db.prepare('SELECT COUNT(*) AS n FROM page_views WHERE invitation_id = ?').get(a.invitation.id).n;
  const byCountry = db.prepare(`
    SELECT COALESCE(NULLIF(country, ''), 'Unknown') AS country, COUNT(*) AS n
    FROM page_views WHERE invitation_id = ?
    GROUP BY country ORDER BY n DESC LIMIT 12
  `).all(a.invitation.id);
  const byDay = db.prepare(`
    SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n
    FROM page_views WHERE invitation_id = ?
    GROUP BY day ORDER BY day DESC LIMIT 30
  `).all(a.invitation.id);
  res.json({ total, byCountry, byDay });
});

module.exports = router;
