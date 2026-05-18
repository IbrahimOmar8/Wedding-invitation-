/**
 * In-process event bus + SSE broker. Routes that mutate data (RSVP,
 * wishes, music, photos, gifts) call publish(invitationId, payload);
 * the dashboard subscribes via /api/sse and gets each event as a JSON
 * message in real time — no polling, no extra runtime dependency.
 *
 * Survival semantics:
 *  - Events are not persisted. A dashboard that connects after the fact
 *    sees only future events. The Activity tab still backfills from the DB.
 *  - Heartbeats every 25s keep proxies from idling the connection out.
 */
const EventEmitter = require('events');

class InvitationBus extends EventEmitter {}
const bus = new InvitationBus();
bus.setMaxListeners(500);

function publish(invitationId, kind, payload) {
  if (!invitationId) return;
  bus.emit(`inv:${invitationId}`, { kind, payload, at: new Date().toISOString() });
}

function subscribe(invitationId, handler) {
  const key = `inv:${invitationId}`;
  bus.on(key, handler);
  return () => bus.off(key, handler);
}

module.exports = { publish, subscribe };
