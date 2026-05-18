/**
 * Server-Sent Events stream of activity for the current user's
 * invitation. Authentication piggybacks on the JWT in the
 * `?token=` query string because EventSource can't send custom
 * Authorization headers.
 */
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { SECRET } = require('../auth');
const { subscribe } = require('../events');
const { getAccessibleInvitation } = require('../access');

const router = express.Router();

router.get('/', (req, res) => {
  const token = req.query.token;
  let userId;
  try {
    const payload = jwt.verify(token, SECRET);
    userId = payload.id;
  } catch (_) { return res.status(401).end(); }

  const a = getAccessibleInvitation(userId);
  if (!a) return res.status(404).end();

  // SSE headers
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(': connected\n\n');

  const unsubscribe = subscribe(a.invitation.id, (event) => {
    res.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
  });

  const heartbeat = setInterval(() => res.write(': hb\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

module.exports = router;
