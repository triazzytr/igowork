const express = require('express');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const SESSION_COOKIE = 'igowork_session'; // the same cookie name auth.js uses

// ---------------------------------------------------------------------------
// Keys: from environment variables (live site) or vapid-keys.json (your computer)
// ---------------------------------------------------------------------------
function loadKeys() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) return { publicKey: pub.trim(), privateKey: priv.trim() };
  try {
    const f = JSON.parse(fs.readFileSync(path.join(__dirname, 'vapid-keys.json'), 'utf8'));
    if (f.publicKey && f.privateKey) return f;
  } catch (e) {}
  return null;
}

const keys = loadKeys();
let enabled = false;

if (keys) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'https://igowork.onrender.com',
      keys.publicKey,
      keys.privateKey
    );
    enabled = true;
  } catch (e) {
    console.error('Push alerts are off: the keys are not valid (' + e.message + ')');
  }
} else {
  console.log('Push alerts are off: no keys found. Run: node make-vapid-keys.js');
}

// ---------------------------------------------------------------------------
// Only real browser push services are accepted as destinations
// ---------------------------------------------------------------------------
const EXACT_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com'];
const HOST_SUFFIXES = ['.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com'];

function allowedEndpoint(endpoint) {
  let u;
  try { u = new URL(endpoint); } catch (e) { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  if (u.port && u.port !== '443') return false;
  const host = u.hostname.toLowerCase();
  return EXACT_HOSTS.includes(host) || HOST_SUFFIXES.some((s) => host.endsWith(s));
}

function sessionToken(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sending. A device only receives alerts while its login session still exists.
// ---------------------------------------------------------------------------
async function sendToAccount(db, accountId, payload) {
  if (!enabled || !accountId) return;

  const subs = db.prepare(`
    SELECT s.id, s.endpoint, s.p256dh, s.auth
    FROM push_subscriptions s
    JOIN sessions x ON x.token = s.session_token
    WHERE s.account_id = ? AND x.expires_at > ?
  `).all(accountId, Date.now());

  const body = JSON.stringify(payload);

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { TTL: 86400, urgency: 'high', timeout: 10000 }
      );
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        // The device no longer exists, so forget it
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
      } else {
        console.error('Push failed (' + (e.statusCode || e.message) + ')');
      }
    }
  }));
}

// Never throws, so a push problem can never break a booking or message
function send(db, accountId, payload) {
  sendToAccount(db, accountId, payload).catch((e) => console.error('Push error:', e.message));
}

module.exports = function (db) {
  const router = express.Router();

  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      session_token TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
    CREATE INDEX IF NOT EXISTS idx_push_account ON push_subscriptions (account_id);
  `);

  // Forget devices whose login has ended
  db.prepare('DELETE FROM push_subscriptions WHERE session_token NOT IN (SELECT token FROM sessions)').run();

  // The background script browsers run to show alerts
  router.get('/sw.js', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'sw.js'));
  });

  // The public key the browser needs in order to subscribe
  router.get('/api/push/key', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(enabled ? { enabled: true, key: keys.publicKey } : { enabled: false });
  });

  // Save (or refresh) this device's subscription for the logged-in person
  router.post('/api/push/subscribe', (req, res) => {
    if (!req.account) {
      return res.status(401).json({ error: 'Please log in first.' });
    }
    if (!enabled) {
      return res.status(503).json({ error: 'Push alerts are not set up on this server.' });
    }

    const b = req.body || {};
    const k = b.keys || {};
    const endpoint = String(b.endpoint || '');
    const p256dh = String(k.p256dh || '');
    const auth = String(k.auth || '');
    const token = sessionToken(req);

    if (!token || !endpoint || !p256dh || !auth ||
        endpoint.length > 2000 || p256dh.length > 200 || auth.length > 200) {
      return res.status(400).json({ error: 'That subscription is not valid.' });
    }
    if (!allowedEndpoint(endpoint)) {
      return res.status(400).json({ error: "This browser's push service is not supported yet." });
    }

    db.prepare(`
      INSERT INTO push_subscriptions (account_id, session_token, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET
        account_id = excluded.account_id,
        session_token = excluded.session_token,
        p256dh = excluded.p256dh,
        auth = excluded.auth
    `).run(req.account.id, token, endpoint, p256dh, auth);

    // Keep at most 10 devices per person
    db.prepare(`
      DELETE FROM push_subscriptions
      WHERE account_id = ?
        AND id NOT IN (SELECT id FROM push_subscriptions WHERE account_id = ? ORDER BY id DESC LIMIT 10)
    `).run(req.account.id, req.account.id);

    res.json({ ok: true });
  });

  // Turn alerts off for one device
  router.post('/api/push/unsubscribe', (req, res) => {
    if (!req.account) {
      return res.status(401).json({ error: 'Please log in first.' });
    }
    const endpoint = String((req.body || {}).endpoint || '');
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND account_id = ?')
      .run(endpoint, req.account.id);
    res.json({ ok: true });
  });

  return router;
};

module.exports.send = send;