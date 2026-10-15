const express = require('express');
const path = require('path');

// Saves one notification. It never throws, because a failed notification
// must never break the booking or message that caused it.
function notify(db, accountId, type, title, body, link) {
  if (!accountId) return; // e.g. demo artisans that have no login
  try {
    // Several unread messages from one chat collapse into the newest one
    if (type === 'message') {
      db.prepare(
        "DELETE FROM notifications WHERE account_id = ? AND type = 'message' AND link = ? AND read_at IS NULL"
      ).run(accountId, link);
    }
    db.prepare(
      'INSERT INTO notifications (account_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)'
    ).run(accountId, type, title, body || null, link || null);

    // Also alert the person's phone or computer (never blocks the caller)
    require('./push').send(db, accountId, {
      title: title,
      body: body || '',
      url: link || '/',
      tag: type + ':' + (link || '')
    });

    // Keep only each person's latest 100
    db.prepare(`
      DELETE FROM notifications
      WHERE account_id = ?
        AND id NOT IN (SELECT id FROM notifications WHERE account_id = ? ORDER BY id DESC LIMIT 100)
    `).run(accountId, accountId);
  } catch (e) {
    console.error('Could not save notification:', e.message);
  }
}

module.exports = function (db) {
  const router = express.Router();

  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      link TEXT,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_account ON notifications (account_id, id);
  `);

  // The script every page loads to show the bell and pop-ups
  router.get('/notify.js', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'notify.js'));
  });

  // My latest notifications and how many are unread
  router.get('/api/notifications', (req, res) => {
    if (!req.account) {
      return res.status(401).json({ error: 'Please log in first.' });
    }
    res.set('Cache-Control', 'no-store');

    const rows = db.prepare(`
      SELECT id, type, title, body, link, read_at, created_at
      FROM notifications WHERE account_id = ? ORDER BY id DESC LIMIT 20
    `).all(req.account.id);

    const unread = db.prepare(
      'SELECT COUNT(*) AS n FROM notifications WHERE account_id = ? AND read_at IS NULL'
    ).get(req.account.id).n;

    res.json({
      unread,
      notifications: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        link: r.link,
        read: !!r.read_at,
        created_at: r.created_at,
      })),
    });
  });

  // Mark one notification read (body: { id }) or all of mine (empty body)
  router.post('/api/notifications/read', (req, res) => {
    if (!req.account) {
      return res.status(401).json({ error: 'Please log in first.' });
    }
    const id = parseInt((req.body || {}).id, 10);

    if (id) {
      db.prepare(
        'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND account_id = ? AND read_at IS NULL'
      ).run(id, req.account.id);
    } else {
      db.prepare(
        'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE account_id = ? AND read_at IS NULL'
      ).run(req.account.id);
    }
    res.json({ ok: true });
  });

  return router;
};

module.exports.notify = notify;