const express = require('express');
const { notify } = require('./notifications');
const path = require('path');

// Chat between the client and the artisan on one booking.
// The browser polls for new messages every few seconds.
module.exports = function (db) {
  const router = express.Router();

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL CHECK (sender_role IN ('client', 'artisan')),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_booking ON messages (booking_id, id);
  `);

  // Finds the booking AND checks the logged-in person is one of its two
  // participants. Returns null otherwise (same result as "doesn't exist").
  function findJob(account, bookingId) {
    const booking = db.prepare(`
      SELECT b.id, b.title, b.status,
             a.full_name AS artisan_name, a.account_id AS artisan_account,
             c.full_name AS client_name,  c.account_id AS client_account
      FROM bookings b
      JOIN artisans a ON a.id = b.artisan_id
      JOIN clients  c ON c.id = b.client_id
      WHERE b.id = ?
    `).get(bookingId);
    if (!booking) return null;

    let side = null;
    if (account.role === 'client' && booking.client_account === account.id) side = 'client';
    if (account.role === 'artisan' && booking.artisan_account === account.id) side = 'artisan';
    if (!side) return null;

    return { booking, side };
  }

  // The chat page itself
  router.get('/chat/:id', (req, res) => {
    if (!req.account) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'chat.html'));
  });

  // Read messages. "after" returns only messages newer than that id.
  router.get('/api/bookings/:id/messages', (req, res) => {
    if (!req.account) {
      return res.status(401).json({ error: 'Please log in first.' });
    }

    const job = findJob(req.account, parseInt(req.params.id, 10));
    const open = job && (job.booking.status === 'accepted' || job.booking.status === 'completed');
    if (!open) {
      return res.status(404).json({ error: 'This chat is not available.' });
    }

    // Opening the chat clears its notifications
    db.prepare('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE account_id = ? AND link = ? AND read_at IS NULL')
      .run(req.account.id, '/chat/' + job.booking.id);

    const after = parseInt(req.query.after, 10) || 0;
    const rows = after > 0
      ? db.prepare(
          'SELECT id, sender_role, body, created_at FROM messages WHERE booking_id = ? AND id > ? ORDER BY id LIMIT 200'
        ).all(job.booking.id, after)
      : db.prepare(
          'SELECT * FROM (SELECT id, sender_role, body, created_at FROM messages WHERE booking_id = ? ORDER BY id DESC LIMIT 200) ORDER BY id'
        ).all(job.booking.id);

    res.json({
      title: job.booking.title,
      other_name: job.side === 'client' ? job.booking.artisan_name : job.booking.client_name,
      role: req.account.role,
      can_send: job.booking.status === 'accepted',
      messages: rows.map((m) => ({
        id: m.id,
        body: m.body,
        created_at: m.created_at,
        mine: m.sender_role === job.side,
      })),
    });
  });

  // Send a message (only while the job is in progress)
  router.post('/api/bookings/:id/messages', (req, res) => {
    if (!req.account) {
      return res.status(401).json({ error: 'Please log in first.' });
    }

    const job = findJob(req.account, parseInt(req.params.id, 10));
    if (!job || (job.booking.status !== 'accepted' && job.booking.status !== 'completed')) {
      return res.status(404).json({ error: 'This chat is not available.' });
    }
    if (job.booking.status !== 'accepted') {
      return res.status(400).json({ error: 'This job is complete, so messages are read-only.' });
    }

    const body = String((req.body || {}).body || '').trim();
    if (!body) {
      return res.status(400).json({ error: 'Please type a message.' });
    }
    if (body.length > 1000) {
      return res.status(400).json({ error: 'Messages can be up to 1000 characters.' });
    }

    // Light spam protection: at most 20 messages a minute from one side
    const recent = db.prepare(
      "SELECT COUNT(*) AS n FROM messages WHERE booking_id = ? AND sender_role = ? AND created_at > datetime('now', '-1 minute')"
    ).get(job.booking.id, job.side).n;
    if (recent >= 20) {
      return res.status(429).json({ error: 'You are sending messages too quickly. Please wait a moment.' });
    }

    const result = db.prepare(
      'INSERT INTO messages (booking_id, sender_role, body) VALUES (?, ?, ?)'
    ).run(job.booking.id, job.side, body);

    // Tell the other person about the new message
    const recipient = job.side === 'client' ? job.booking.artisan_account : job.booking.client_account;
    notify(db, recipient, 'message', 'New message from ' + req.account.full_name,
      body.slice(0, 80), '/chat/' + job.booking.id);

    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  return router;
};