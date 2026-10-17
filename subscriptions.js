const express = require('express');
const crypto = require('crypto');
const path = require('path');

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const PREMIUM_PRICE = 2000;   // Naira per period (a placeholder: set your real price later)
const PERIOD_DAYS = 30;       // how long one payment lasts
const DAY_MS = 24 * 60 * 60 * 1000;

// The monthly job limit for FREE artisans. It is OFF unless you switch it on:
//   ENFORCE_JOB_CAP=true      turns the limit on
//   FREE_JOBS_PER_MONTH=5     how many jobs a free artisan may accept each month
const ENFORCE_CAP = process.env.ENFORCE_JOB_CAP === 'true';
const FREE_JOBS_PER_MONTH = parseInt(process.env.FREE_JOBS_PER_MONTH, 10) || 5;

// Test checkout (no real money). Always open on your computer. On the live site
// (NODE_ENV=production) it stays CLOSED unless you set PREMIUM_TEST_MODE=true,
// so strangers cannot hand themselves a free badge.
const TEST_MODE =
  process.env.NODE_ENV !== 'production' || process.env.PREMIUM_TEST_MODE === 'true';

// ---------------------------------------------------------------------------
// Helpers (also used by other files)
// ---------------------------------------------------------------------------
function premiumUntil(db, accountId) {
  const row = db.prepare('SELECT premium_until FROM subscriptions WHERE account_id = ?').get(accountId);
  return row ? Number(row.premium_until) : 0;
}

function isPremium(db, accountId) {
  return premiumUntil(db, accountId) > Date.now();
}

// How many jobs this artisan has accepted since the 1st of this month (UTC)
function jobsThisMonth(db, artisanId) {
  return db.prepare(
    "SELECT COUNT(*) AS n FROM bookings WHERE artisan_id = ? AND accepted_at >= strftime('%Y-%m-01 00:00:00', 'now')"
  ).get(artisanId).n;
}

// Marks Premium artisans in a list of search results and removes private details
// (internal ids and exact home location) before the list goes to the browser.
function annotate(db, artisans) {
  const rows = db.prepare('SELECT account_id FROM subscriptions WHERE premium_until > ?').all(Date.now());
  const premium = new Set(rows.map((r) => r.account_id));
  artisans.forEach((a) => {
    a.is_premium = a.account_id != null && premium.has(a.account_id);
    delete a.account_id;
    delete a.latitude;
    delete a.longitude;
  });
  return artisans;
}

module.exports = function (db) {
  const router = express.Router();

  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      account_id INTEGER PRIMARY KEY,
      premium_until INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
    CREATE TABLE IF NOT EXISTS subscription_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      provider TEXT NOT NULL,
      reference TEXT NOT NULL,
      period_start INTEGER NOT NULL,
      period_end INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
  `);

  // Record WHEN each job was accepted, so we can count jobs per month.
  // A small database trigger stamps the time automatically.
  if (!db.prepare('PRAGMA table_info(bookings)').all().some((c) => c.name === 'accepted_at')) {
    db.exec('ALTER TABLE bookings ADD COLUMN accepted_at TEXT');
  }
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS bookings_stamp_accepted
    AFTER UPDATE OF status ON bookings
    WHEN NEW.status = 'accepted' AND OLD.status != 'accepted'
    BEGIN
      UPDATE bookings SET accepted_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);
  // Jobs accepted before this feature existed: count them from the day they were requested
  db.prepare(
    "UPDATE bookings SET accepted_at = created_at WHERE accepted_at IS NULL AND status IN ('accepted', 'completed')"
  ).run();

  // Only a logged-in artisan with a profile gets through; otherwise replies with an error
  function artisanOnly(req, res) {
    if (!req.account) {
      res.status(401).json({ error: 'Please log in first.' });
      return null;
    }
    if (req.account.role !== 'artisan') {
      res.status(403).json({ error: 'Premium is for artisan accounts.' });
      return null;
    }
    const artisan = db.prepare('SELECT id FROM artisans WHERE account_id = ?').get(req.account.id);
    if (!artisan) {
      res.status(404).json({ error: 'Artisan profile not found.' });
      return null;
    }
    return artisan;
  }

  function stateFor(account, artisan) {
    const until = premiumUntil(db, account.id);
    const active = until > Date.now();
    return {
      premium: active,
      premium_until: active ? new Date(until).toISOString() : null,
      price: PREMIUM_PRICE,
      period_days: PERIOD_DAYS,
      test_mode: TEST_MODE,
      cap: {
        enforced: ENFORCE_CAP,
        limit: FREE_JOBS_PER_MONTH,
        used: jobsThisMonth(db, artisan.id),
      },
    };
  }

  // ---- Pages and the small script that adds the plan card to the dashboard ----
  router.get('/premium', (req, res) => {
    if (!req.account) return res.redirect('/login');
    if (req.account.role !== 'artisan') return res.redirect('/app');
    res.sendFile(path.join(__dirname, 'premium.html'));
  });

  router.get('/premium-ui.js', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'premium-ui.js'));
  });

  // ---- My plan ----
  router.get('/api/premium', (req, res) => {
    const artisan = artisanOnly(req, res);
    if (!artisan) return;
    res.set('Cache-Control', 'no-store');
    res.json(stateFor(req.account, artisan));
  });

  // ---- Buy (or extend) Premium. TEST MODE: no real money moves. ----
  router.post('/api/premium/subscribe', (req, res) => {
    const artisan = artisanOnly(req, res);
    if (!artisan) return;

    if (!TEST_MODE) {
      return res.status(503).json({ error: 'Premium checkout is not open yet.' });
    }

    const now = Date.now();
    const start = Math.max(now, premiumUntil(db, req.account.id));
    if (start - now > 330 * DAY_MS) {
      return res.status(400).json({ error: 'Your Premium already runs for about a year.' });
    }
    const end = start + PERIOD_DAYS * DAY_MS;
    const reference = 'TEST-' + crypto.randomBytes(6).toString('hex');

    // A real provider (Paystack, Flutterwave) would be called and confirmed here,
    // and Premium would only be switched on after the provider says the payment worked.
    try {
      db.exec('BEGIN');
      db.prepare(
        'INSERT INTO subscription_payments (account_id, amount, provider, reference, period_start, period_end) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(req.account.id, PREMIUM_PRICE, 'test', reference, start, end);
      db.prepare(`
        INSERT INTO subscriptions (account_id, premium_until) VALUES (?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          premium_until = excluded.premium_until,
          updated_at = CURRENT_TIMESTAMP
      `).run(req.account.id, end);
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (ignore) {}
      return res.status(500).json({ error: 'Could not start Premium.' });
    }

    res.status(201).json(Object.assign(
      { message: 'Test payment recorded (no real money was taken). Premium is active.' },
      stateFor(req.account, artisan)
    ));
  });

  // ---- The monthly job limit for free artisans (off unless switched on) ----
  // This runs BEFORE the normal "accept" handler. If the artisan is allowed, it
  // passes the request along with next(); otherwise it stops here with a message.
  router.post('/api/bookings/:id/accept', (req, res, next) => {
    if (!ENFORCE_CAP || !req.account || req.account.role !== 'artisan') return next();

    const artisan = db.prepare('SELECT id FROM artisans WHERE account_id = ?').get(req.account.id);
    const booking = artisan && db.prepare(
      'SELECT status FROM bookings WHERE id = ? AND artisan_id = ?'
    ).get(parseInt(req.params.id, 10), artisan.id);

    // Not their booking, or already answered: let the normal handler explain
    if (!booking || booking.status !== 'pending') return next();
    if (isPremium(db, req.account.id)) return next();

    if (jobsThisMonth(db, artisan.id) >= FREE_JOBS_PER_MONTH) {
      return res.status(403).json({
        error: 'You have reached the free limit of ' + FREE_JOBS_PER_MONTH +
          ' accepted jobs this month. Upgrade to Premium to accept more.',
      });
    }
    next();
  });

  return router;
};

module.exports.annotate = annotate;
module.exports.isPremium = isPremium;