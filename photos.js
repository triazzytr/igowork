const express = require('express');
const path = require('path');

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------
const MAX_BYTES = 200 * 1024;   // the biggest photo the server will store
const MAX_SIDE = 1024;          // the biggest width or height, in pixels
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ---------------------------------------------------------------------------
// Looking inside the file to see what it REALLY is (never trust the file name)
// ---------------------------------------------------------------------------
function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }                       // padding byte
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd9)) { i += 2; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    if (m === 0xda) return null;                             // image data starts, no size found
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function pngSize(b) {
  if (b.length < 24 || b.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function webpSize(b) {
  if (b.length < 30) return null;
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (kind === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') {
    return {
      width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
      height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
    };
  }
  return null;
}

const PNG_START = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Returns { mime, width, height } for a real JPEG, PNG or WebP, otherwise null
function imageInfo(b) {
  let mime = null;
  let size = null;
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    mime = 'image/jpeg';
    size = jpegSize(b);
  } else if (b.length > 8 && b.subarray(0, 8).equals(PNG_START)) {
    mime = 'image/png';
    size = pngSize(b);
  } else if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    mime = 'image/webp';
    size = webpSize(b);
  }
  if (!mime || !size || !(size.width > 0) || !(size.height > 0)) return null;
  return { mime: mime, width: size.width, height: size.height };
}

// ---------------------------------------------------------------------------
// Used by other files: adds photo_url to search results.
// Must run BEFORE the Premium step removes account_id from the results.
// ---------------------------------------------------------------------------
function annotate(db, artisans) {
  const ids = artisans.map((a) => a.account_id).filter((id) => id != null);
  const versions = new Map();
  if (ids.length) {
    const marks = ids.map(() => '?').join(',');
    db.prepare('SELECT account_id, updated_at FROM profile_photos WHERE account_id IN (' + marks + ')')
      .all(...ids)
      .forEach((r) => versions.set(r.account_id, r.updated_at));
  }
  artisans.forEach((a) => {
    const v = a.account_id != null ? versions.get(a.account_id) : undefined;
    a.photo_url = v ? '/api/artisans/' + a.id + '/photo?v=' + v : null;
  });
  return artisans;
}

module.exports = function (db) {
  const router = express.Router();

  db.exec(`
    CREATE TABLE IF NOT EXISTS profile_photos (
      account_id INTEGER PRIMARY KEY,
      mime TEXT NOT NULL,
      data BLOB NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
  `);

  function requireLogin(req, res, next) {
    if (!req.account) return res.status(401).json({ error: 'Please log in first.' });
    next();
  }

  // Reads the raw photo bytes, and turns "too big" into a friendly message
  const parser = express.raw({ type: TYPES, limit: MAX_BYTES });
  function readPhoto(req, res, next) {
    parser(req, res, function (err) {
      if (err) {
        const tooBig = err.status === 413 || err.type === 'entity.too.large';
        return res.status(tooBig ? 413 : 400).json({
          error: tooBig ? 'That photo is too large.' : 'Could not read that photo.',
        });
      }
      next();
    });
  }

  function sendPhoto(res, row) {
    res.set({
      'Content-Type': row.mime,
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    });
    res.send(Buffer.from(row.data));
  }

  function photoUrlFor(accountId) {
    const row = db.prepare('SELECT updated_at FROM profile_photos WHERE account_id = ?').get(accountId);
    return row ? '/api/profile/photo?v=' + row.updated_at : null;
  }

  // ---- The profile page and my details ----
  router.get('/profile', (req, res) => {
    if (!req.account) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'profile.html'));
  });

  router.get('/api/profile', requireLogin, (req, res) => {
    const acc = db.prepare('SELECT full_name, email, role, phone FROM accounts WHERE id = ?').get(req.account.id);
    if (!acc) return res.status(404).json({ error: 'Account not found.' });

    const details = req.account.role === 'artisan'
      ? db.prepare(
          'SELECT trade_category, years_of_experience, service_fee, average_rating, total_ratings, total_jobs_completed FROM artisans WHERE account_id = ?'
        ).get(req.account.id)
      : db.prepare('SELECT average_rating, total_ratings FROM clients WHERE account_id = ?').get(req.account.id);

    res.set('Cache-Control', 'no-store');
    res.json({
      account: { full_name: acc.full_name, email: acc.email, role: acc.role, phone: acc.phone || null },
      photo_url: photoUrlFor(req.account.id),
      details: details || null,
    });
  });

  // ---- My own photo: show, save, remove ----
  router.get('/api/profile/photo', requireLogin, (req, res) => {
    const row = db.prepare('SELECT mime, data FROM profile_photos WHERE account_id = ?').get(req.account.id);
    if (!row) return res.status(404).json({ error: 'No photo.' });
    sendPhoto(res, row);
  });

  router.put('/api/profile/photo', requireLogin, readPhoto, (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length < 100) {
      return res.status(400).json({ error: 'Please choose a JPEG, PNG or WebP photo.' });
    }
    if (buf.length > MAX_BYTES) {
      return res.status(413).json({ error: 'That photo is too large.' });
    }

    const info = imageInfo(buf);
    if (!info) {
      return res.status(400).json({ error: 'Only JPEG, PNG or WebP photos are accepted.' });
    }
    if (info.width > MAX_SIDE || info.height > MAX_SIDE) {
      return res.status(400).json({ error: 'That photo is too big in size. Please choose a smaller one.' });
    }

    db.prepare(`
      INSERT INTO profile_photos (account_id, mime, data, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at
    `).run(req.account.id, info.mime, buf, Date.now());

    res.json({ ok: true, photo_url: photoUrlFor(req.account.id) });
  });

  router.delete('/api/profile/photo', requireLogin, (req, res) => {
    db.prepare('DELETE FROM profile_photos WHERE account_id = ?').run(req.account.id);
    res.json({ ok: true });
  });

  // ---- An artisan's photo (shown on search cards) ----
  // Open to clients and visitors. Other ARTISANS cannot look at it, only the owner can.
  router.get('/api/artisans/:id/photo', (req, res) => {
    const row = db.prepare(`
      SELECT a.account_id, p.mime, p.data
      FROM artisans a JOIN profile_photos p ON p.account_id = a.account_id
      WHERE a.id = ?
    `).get(parseInt(req.params.id, 10));

    if (!row) return res.status(404).json({ error: 'No photo.' });
    if (req.account && req.account.role === 'artisan' && req.account.id !== row.account_id) {
      return res.status(404).json({ error: 'No photo.' });
    }
    sendPhoto(res, row);
  });

  // ---- The OTHER person's photo on one of my jobs ----
  // A client sees the artisan's photo. An artisan sees the client's photo
  // only once the job has been accepted.
  router.get('/api/bookings/:id/photo', (req, res) => {
    if (!req.account) return res.status(404).json({ error: 'No photo.' });

    const job = db.prepare(`
      SELECT b.status, a.account_id AS artisan_account, c.account_id AS client_account
      FROM bookings b
      JOIN artisans a ON a.id = b.artisan_id
      JOIN clients  c ON c.id = b.client_id
      WHERE b.id = ?
    `).get(parseInt(req.params.id, 10));

    let target = null;
    if (job) {
      if (req.account.role === 'client' && job.client_account === req.account.id) {
        target = job.artisan_account;
      } else if (
        req.account.role === 'artisan' && job.artisan_account === req.account.id &&
        (job.status === 'accepted' || job.status === 'completed')
      ) {
        target = job.client_account;
      }
    }
    if (target == null) return res.status(404).json({ error: 'No photo.' });

    const row = db.prepare('SELECT mime, data FROM profile_photos WHERE account_id = ?').get(target);
    if (!row) return res.status(404).json({ error: 'No photo.' });
    sendPhoto(res, row);
  });

  return router;
};

module.exports.annotate = annotate;
module.exports.imageInfo = imageInfo;