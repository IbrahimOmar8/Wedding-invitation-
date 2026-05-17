/**
 * Resolves the invitation the current WedCard user can edit.
 * Owners always have access; cohosts get access too. Returns null if
 * the user has no invitation yet (shouldn't happen post-verify-otp).
 */
const db = require('./db');

function getAccessibleInvitation(userId) {
  // Owner first
  let inv = db.prepare('SELECT * FROM invitations WHERE user_id = ?').get(userId);
  if (inv) return { invitation: inv, role: 'owner', ownerUserId: userId };

  // Cohost
  const co = db.prepare(`
    SELECT i.*, c.user_id AS owner_id FROM invitations i
    JOIN cohosts c ON c.invitation_id = i.id
    JOIN users u ON u.id = i.user_id
    WHERE c.user_id = ?
  `).get(userId);
  if (co) return { invitation: co, role: 'cohost', ownerUserId: co.owner_id };

  return null;
}

function getInvitationOwnerId(invitationId) {
  const row = db.prepare('SELECT user_id FROM invitations WHERE id = ?').get(invitationId);
  return row?.user_id || null;
}

module.exports = { getAccessibleInvitation, getInvitationOwnerId };
