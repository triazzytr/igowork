const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { isValidCoordinates } = require('./igowork-service');

// This file adds accounts: sign up, log in, log out.
module.exports = function (db) {
  const router = express.Router();
  const COOKIE = 'igowork_session';
  const SESSION_DAYS = 30;

  // Simple in-memory rate limiting: blocks repeated login/signup attempts
  // from the same IP address. Resets if the server restarts.
  const ATTEMPT_LIMIT = 8;
  const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  const attempts = new Map();

  function tooManyAttempts(req) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const record = attempts.get(ip) || { count: 0, since: now };
    if (now - record.since > ATTEMPT_WINDOW_MS) {
      record.count = 0;
      record.since = now;
    }
    record.count += 1;
    attempts.set(ip, record);
    return record.count > ATTEMPT_LIMIT;
  }

  // Tables for accounts and login sessions (created the first time only)
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('client', 'artisan')),
      full_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
  `);

  // Link existing client/artisan rows to accounts (added only if missing)
  function addColumnIfMissing(table, column) {
    const cols = db.prepare('PRAGMA table_info(' + table + ')').all();
    if (!cols.some((c) => c.name === column)) {
      db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' INTEGER');
    }
  }
  addColumnIfMissing('clients', 'account_id');
  addColumnIfMissing('artisans', 'account_id');

  // Phone numbers: private until a booking fee is paid
  if (!db.prepare('PRAGMA table_info(accounts)').all().some((c) => c.name === 'phone')) {
    db.exec('ALTER TABLE accounts ADD COLUMN phone TEXT');
  }

  // ---- Password helpers: store a salted, scrambled version only ----
  function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return salt + ':' + hash;
  }

  function checkPassword(password, stored) {
    const parts = stored.split(':');
    const test = crypto.scryptSync(password, parts[0], 64);
    const real = Buffer.from(parts[1], 'hex');
    return real.length === test.length && crypto.timingSafeEqual(real, test);
  }

  // ---- Cookie + session helpers ----
  function getCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
      const i = part.indexOf('=');
      if (i > -1 && part.slice(0, i).trim() === name) {
        return decodeURIComponent(part.slice(i + 1).trim());
      }
    }
    return null;
  }

  function startSession(res, accountId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
    db.prepare('INSERT INTO sessions (token, account_id, expires_at) VALUES (?, ?, ?)')
      .run(token, accountId, expires);
    res.setHeader(
      'Set-Cookie',
      COOKIE + '=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + SESSION_DAYS * 86400 +
        (process.env.NODE_ENV === 'production' ? '; Secure' : '')
    );
  }

  // On every request: work out who is logged in (if anyone).
  // Later pages can use req.account to know who is acting.
  router.use((req, res, next) => {
    req.account = null;
    const token = getCookie(req, COOKIE);
    if (token) {
      const row = db.prepare(`
        SELECT a.id, a.email, a.role, a.full_name, s.expires_at
        FROM sessions s JOIN accounts a ON a.id = s.account_id
        WHERE s.token = ?
      `).get(token);
      if (row && row.expires_at > Date.now()) {
        req.account = { id: row.id, email: row.email, role: row.role, full_name: row.full_name };
      } else if (row) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      }
    }
    next();
  });

  router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
  });

  // ---- Sign up ----
  router.post('/api/signup', (req, res) => {
    if (tooManyAttempts(req)) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const name = String(b.full_name || '').trim();
    const password = String(b.password || '');
    const role = b.role;
    const phone = String(b.phone || '').replace(/[^0-9+]/g, '');

    if (!name) return res.status(400).json({ error: 'Please enter your name.' });
    if (!/^[+]?[0-9]{10,15}$/.test(phone)) {
      return res.status(400).json({ error: 'Please enter a valid phone number, for example 08012345678.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (role !== 'client' && role !== 'artisan') {
      return res.status(400).json({ error: 'Please choose client or artisan.' });
    }

    // Artisans also need a profile so they can appear in searches
    let trade, lat, lng, experience, fee;
    if (role === 'artisan') {
      trade = String(b.trade_category || '').trim().toLowerCase();
      lat = parseFloat(b.latitude);
      lng = parseFloat(b.longitude);
      experience = parseInt(b.years_of_experience, 10);
      fee = parseFloat(b.service_fee);
      if (!trade) return res.status(400).json({ error: 'Please choose your trade.' });
      if (!isValidCoordinates(lat, lng)) {
        return res.status(400).json({ error: 'Please enter a valid latitude and longitude.' });
      }
      if (isNaN(experience) || experience < 0 || isNaN(fee) || fee < 0) {
        return res.status(400).json({ error: 'Experience and fee must be 0 or more.' });
      }
    }

    if (db.prepare('SELECT id FROM accounts WHERE email = ?').get(email)) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    try {
      db.exec('BEGIN');
      const created = db.prepare(
        'INSERT INTO accounts (email, password_hash, role, full_name, phone) VALUES (?, ?, ?, ?, ?)'
      ).run(email, hashPassword(password), role, name, phone);
      const accountId = Number(created.lastInsertRowid);

      if (role === 'client') {
        db.prepare('INSERT INTO clients (full_name, account_id) VALUES (?, ?)').run(name, accountId);
      } else {
        db.prepare(`
          INSERT INTO artisans
            (full_name, trade_category, latitude, longitude, years_of_experience, service_fee, account_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(name, trade, lat, lng, experience, fee, accountId);
      }
      db.exec('COMMIT');

      startSession(res, accountId);
      res.status(201).json({ account: { id: accountId, email, role, full_name: name } });
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (ignore) {}
      res.status(500).json({ error: 'Could not create the account.' });
    }
  });

  // ---- Log in ----
  router.post('/api/login', (req, res) => {
    if (tooManyAttempts(req)) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');

    const acc = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email);
    // Same message for "no such email" and "wrong password" on purpose
    if (!acc || !checkPassword(password, acc.password_hash)) {
      return res.status(401).json({ error: 'Wrong email or password.' });
    }

    startSession(res, acc.id);
    res.json({ account: { id: acc.id, email: acc.email, role: acc.role, full_name: acc.full_name } });
  });

  // ---- Log out ----
  router.post('/api/logout', (req, res) => {
    const token = getCookie(req, COOKIE);
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.setHeader('Set-Cookie', COOKIE + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' + (process.env.NODE_ENV === 'production' ? '; Secure' : ''));
    res.json({ ok: true });
  });

  // ---- Who am I? ----
  router.get('/api/me', (req, res) => {
    res.json({ account: req.account });
  });

  return router;
};