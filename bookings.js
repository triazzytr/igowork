const express = require('express');
const { notify } = require('./notifications');

// Bookings: creation, listing, accept/decline, completion.
// Freemium: contact details unlock for free as soon as the artisan accepts.
module.exports = function (db) {
  const router = express.Router();

  function needLogin(req, res) {
    if (!req.account) {
      res.status(401).json({ error: 'Please log in first.' });
      return false;
    }
    return true;
  }

  function myProfile(account) {
    const table = account.role === 'client' ? 'clients' : 'artisans';
    return db.prepare('SELECT id FROM ' + table + ' WHERE account_id = ?').get(account.id);
  }

  // ---------------------------------------------------------------------
  // "My jobs" page for clients: http://localhost:3000/bookings
  // ---------------------------------------------------------------------
  const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="IGOwork">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<title>My jobs - IGOwork</title>
<style>
:root{--bg:#f5f5f7;--surface:#fff;--surface-2:#f0f0f2;--text:#1d1d1f;--muted:#6e6e73;--accent:#0071e3;--line:rgba(0,0,0,.07);--shadow:0 1px 2px rgba(0,0,0,.04),0 10px 28px rgba(0,0,0,.06);--ease:cubic-bezier(.4,0,.2,1)}
@media(prefers-color-scheme:dark){:root{--bg:#000;--surface:#1c1c1e;--surface-2:#242426;--text:#f5f5f7;--muted:#98989d;--line:rgba(255,255,255,.08);--shadow:0 1px 2px rgba(0,0,0,.3),0 10px 28px rgba(0,0,0,.45)}}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased;letter-spacing:-.01em}
header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.72);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);border-bottom:1px solid var(--line)}
@media(prefers-color-scheme:dark){header{background:rgba(28,28,30,.72)}}
.nav{max-width:680px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;gap:10px}
.mark{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#0071e3,#5856d6);display:grid;place-items:center;color:#fff;font-weight:700;font-size:13px;flex:none}
.brand{font-size:17px;font-weight:600}
.acct{margin-left:auto;font-size:13px;color:var(--muted);text-align:right;line-height:1.4}
.acct a{color:var(--accent);text-decoration:none;font-weight:500}
.wrap{max-width:680px;margin:0 auto;padding:40px 20px 80px}
h1{font-size:32px;font-weight:700;letter-spacing:-.02em;margin:0}
.lede{color:var(--muted);font-size:16px;margin:8px 0 0}
#msg{min-height:20px;margin:16px 0 0;font-weight:600;font-size:14px}
section{margin-top:36px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700;margin:0 0 12px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);padding:18px 20px;margin-bottom:12px}
.jtop{display:flex;align-items:flex-start;gap:10px}
.jtitle{font-size:16px;font-weight:600;flex:1}
.pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
.p-pending{background:rgba(255,149,0,.13);color:#ff9500}
.p-accepted{background:rgba(0,113,227,.12);color:var(--accent)}
.p-completed{background:rgba(52,199,89,.13);color:#248a3d}
.p-declined{background:rgba(255,59,48,.12);color:#ff3b30}
.jmeta{color:var(--muted);font-size:13px;margin-top:4px}
.note{color:var(--muted);font-size:13.5px;margin-top:12px}
.contact{margin-top:12px;font-size:14px}
.contact a{color:var(--accent);text-decoration:none;font-weight:600}
.stars{display:flex;gap:4px;margin:12px 0 10px}
.star{border:0;background:none;font-size:24px;line-height:1;color:var(--line);cursor:pointer;padding:0;transition:color .15s var(--ease),transform .15s var(--ease)}
.star.on{color:#ff9500;transform:scale(1.08)}
.btn{appearance:none;border:0;border-radius:980px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;background:var(--accent);color:#fff;transition:transform .15s var(--ease),opacity .15s var(--ease)}
.btn:active{transform:scale(.96)}
.btn:disabled{opacity:.4;cursor:default}
.btn.ghost{background:transparent;color:var(--accent);border:1px solid var(--line)}
.empty{text-align:center;color:var(--muted);padding:32px 18px;border:1px dashed var(--line);border-radius:20px;font-size:14px}
.links{display:flex;gap:18px;margin-top:40px}
.links a{color:var(--accent);text-decoration:none;font-size:14px;font-weight:500}
#loggedout{display:none;text-align:center;padding:80px 20px}
</style>
</head>
<body>
<header><div class="nav"><div class="mark">IG</div><div class="brand">IGOwork</div>
  <div class="acct" id="acct"></div>
</div></header>

<div class="wrap" id="loggedin" style="display:none">
  <h1>My jobs</h1>
  <p class="lede">Track your requests, see contact details once accepted, and leave a review.</p>
  <p id="msg"></p>

  <section><h2>Awaiting response</h2><div id="pending"></div></section>
  <section><h2>In progress</h2><div id="active"></div></section>
  <section><h2>Completed</h2><div id="done"></div></section>

  <div class="links"><a href="/app">Find artisans</a><a href="#" id="logout">Log out</a></div>
</div>

<div class="wrap" id="loggedout">
  <h1>My jobs</h1>
  <p class="lede">Please <a href="/login" style="color:var(--accent)">log in</a> to see your jobs.</p>
</div>

<script>
var $ = function (id) { return document.getElementById(id); };
var role = null;

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function post(url, data) {
  return fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {})
  }).then(function (r) { return r.json(); });
}
function say(text, bad) {
  $('msg').textContent = text;
  $('msg').style.color = bad ? '#ff3b30' : 'inherit';
}
function pill(status) {
  var label = status.charAt(0).toUpperCase() + status.slice(1);
  return '<span class="pill p-' + status + '">' + label + '</span>';
}

function card(b) {
  var html = '<div class="card"><div class="jtop"><div class="jtitle">' + esc(b.title) + '</div>' + pill(b.status) + '</div>' +
    '<div class="jmeta">Artisan: ' + esc(b.artisan_name) + '</div>';

  if (b.status === 'pending') {
    html += '<div class="note">Waiting for the artisan to respond.</div>';
  } else if (b.status === 'declined') {
    html += '<div class="note">The artisan declined this request.</div>';
  } else if (b.status === 'accepted') {
    html += '<div class="contact">Phone: ' + (b.contact_phone
      ? '<a href="tel:' + esc(b.contact_phone) + '">' + esc(b.contact_phone) + '</a>'
      : '<span class="note" style="display:inline">not on file yet</span>') + '</div>';
    html += '<div class="note">Waiting for the artisan to finish the job.</div>';
  } else if (b.status === 'completed') {
    if (b.my_stars) {
      html += '<div class="note">You rated this job ' + b.my_stars + ' / 5.' +
        (b.their_stars ? ' They rated you ' + b.their_stars + ' / 5.' : ' Their rating appears once they rate too.') + '</div>';
    } else {
      html += '<div class="stars" data-id="' + b.id + '" data-value="0">' +
        [1,2,3,4,5].map(function (n) { return '<button class="star" data-n="' + n + '">\u2605</button>'; }).join('') +
        '</div><button class="btn" data-act="rate" data-id="' + b.id + '" disabled>Submit rating</button>';
    }
  }
  if (b.status === 'accepted' || b.status === 'completed') {
    html += '<div class="note"><a href="/chat/' + b.id + '" style="color:var(--accent);font-weight:600;text-decoration:none">' + (b.status === 'accepted' ? 'Message' : 'View messages') + '</a></div>';
  }
  return html + '</div>';
}

function loadJobs() {
  fetch('/api/bookings').then(function (r) { return r.json(); }).then(function (j) {
    if (j.error) { say(j.error, true); return; }
    role = j.role;
    var pending = j.bookings.filter(function (b) { return b.status === 'pending' || b.status === 'declined'; });
    var active = j.bookings.filter(function (b) { return b.status === 'accepted'; });
    var done = j.bookings.filter(function (b) { return b.status === 'completed'; });

    $('pending').innerHTML = pending.length ? pending.map(card).join('') : '<div class="empty">Nothing waiting on a response.</div>';
    $('active').innerHTML = active.length ? active.map(card).join('') : '<div class="empty">No jobs in progress.</div>';
    $('done').innerHTML = done.length ? done.map(card).join('') : '<div class="empty">No completed jobs yet.</div>';
  });
}

document.body.addEventListener('click', function (e) {
  if (e.target.classList.contains('star')) {
    var box = e.target.parentElement;
    var n = parseInt(e.target.dataset.n, 10);
    box.dataset.value = n;
    Array.prototype.forEach.call(box.querySelectorAll('.star'), function (s) {
      s.classList.toggle('on', parseInt(s.dataset.n, 10) <= n);
    });
    var btn = box.nextElementSibling;
    if (btn) btn.disabled = false;
    return;
  }
  var act = e.target.dataset && e.target.dataset.act;
  if (!act) return;
  var id = e.target.dataset.id;
  if (act === 'rate') {
    var box = document.querySelector('.stars[data-id="' + id + '"]');
    var value = box ? box.dataset.value : 0;
    post('/api/bookings/' + id + '/rate', { stars: value }).then(function (j) {
      say(j.error ? j.error : j.message, !!j.error);
      loadJobs();
    });
  }
});

$('logout').onclick = function (e) {
  e.preventDefault();
  post('/api/logout').then(function () { location.href = '/login'; });
};

fetch('/api/me').then(function (r) { return r.json(); }).then(function (j) {
  var a = j.account;
  if (!a) { $('loggedout').style.display = 'block'; return; }
  $('acct').innerHTML = esc(a.full_name) + '<br><a href="/login">Account</a>';
  $('loggedin').style.display = 'block';
  loadJobs();
});
</script>
<script src="/notify.js"></script>
</body>
</html>`;

  router.get('/bookings', (req, res) => {
    res.send(PAGE);
  });

  // ---------------------------------------------------------------------
  // Create a booking: clients only, made as the logged-in client
  // ---------------------------------------------------------------------
  router.post('/api/bookings', (req, res) => {
    if (!needLogin(req, res)) return;
    if (req.account.role !== 'client') {
      return res.status(403).json({ error: 'Only client accounts can book. Please log in as a client.' });
    }

    const me = myProfile(req.account);
    if (!me) return res.status(400).json({ error: 'Client profile not found.' });

    const b = req.body || {};
    const artisanId = parseInt(b.artisan_id, 10);

    if (!b.title || !String(b.title).trim()) {
      return res.status(400).json({ error: 'Please describe what needs doing.' });
    }

    const artisan = db.prepare('SELECT id FROM artisans WHERE id = ?').get(artisanId);
    if (!artisan) return res.status(400).json({ error: 'That artisan does not exist.' });

    const result = db.prepare(
      'INSERT INTO bookings (client_id, artisan_id, title) VALUES (?, ?, ?)'
    ).run(me.id, artisan.id, String(b.title).trim());

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid);
    // Tell the artisan a new request has arrived
    const target = db.prepare('SELECT account_id FROM artisans WHERE id = ?').get(artisan.id);
    notify(db, target && target.account_id, 'request', 'New booking request',
      req.account.full_name + ': ' + String(b.title).trim().slice(0, 80), '/dashboard');

    res.status(201).json({ booking });
  });

  // ---------------------------------------------------------------------
  // List MY bookings (as client or as artisan). Contact details unlock
  // automatically once the artisan accepts.
  // ---------------------------------------------------------------------
  router.get('/api/bookings', (req, res) => {
    if (!needLogin(req, res)) return;

    const me = myProfile(req.account);
    if (!me) return res.json({ role: req.account.role, count: 0, bookings: [] });

    const isClient = req.account.role === 'client';
    const column = isClient ? 'client_id' : 'artisan_id';
    const mine = isClient ? 'client' : 'artisan';
    const theirs = isClient ? 'artisan' : 'client';

    const bookings = db.prepare(`
      SELECT b.id, b.title, b.status, b.created_at,
             a.full_name AS artisan_name,
             c.full_name AS client_name,
             (SELECT phone FROM accounts WHERE id = a.account_id) AS artisan_phone,
             (SELECT phone FROM accounts WHERE id = c.account_id) AS client_phone,
             (SELECT stars FROM ratings r
               WHERE r.booking_id = b.id AND r.rater_type = ?) AS my_stars,
             (SELECT stars FROM ratings r
               WHERE r.booking_id = b.id AND r.rater_type = ?
                 AND EXISTS (SELECT 1 FROM ratings m
                              WHERE m.booking_id = b.id AND m.rater_type = ?)) AS their_stars
      FROM bookings b
      JOIN artisans a ON a.id = b.artisan_id
      JOIN clients  c ON c.id = b.client_id
      WHERE b.${column} = ?
      ORDER BY b.id DESC
    `).all(mine, theirs, mine, me.id);

    const unlocked = (status) => status === 'accepted' || status === 'completed';
    bookings.forEach((bk) => {
      bk.contact_phone = unlocked(bk.status) ? (isClient ? bk.artisan_phone : bk.client_phone) : null;
      delete bk.artisan_phone;
      delete bk.client_phone;
    });

    res.json({ role: req.account.role, count: bookings.length, bookings });
  });

  // ---------------------------------------------------------------------
  // Accept or decline: only the artisan on that job, only while pending
  // ---------------------------------------------------------------------
  function respond(newStatus) {
    return (req, res) => {
      if (!needLogin(req, res)) return;
      if (req.account.role !== 'artisan') {
        return res.status(403).json({ error: 'Only the artisan can respond to a request.' });
      }
      const me = myProfile(req.account);
      const id = parseInt(req.params.id, 10);
      const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);

      if (!booking || !me || booking.artisan_id !== me.id) {
        return res.status(404).json({ error: 'Booking not found.' });
      }

      const result = db.prepare(
        "UPDATE bookings SET status = ? WHERE id = ? AND status = 'pending'"
      ).run(newStatus, id);
      if (result.changes > 0) {
        const owner = db.prepare('SELECT account_id FROM clients WHERE id = ?').get(booking.client_id);
        if (newStatus === 'accepted') {
          notify(db, owner && owner.account_id, 'accepted', 'Booking accepted',
            req.account.full_name + ' accepted "' + booking.title + '". You can message them now.', '/chat/' + id);
        } else {
          notify(db, owner && owner.account_id, 'declined', 'Request declined',
            req.account.full_name + ' could not take "' + booking.title + '".', '/bookings');
        }
      }
      if (result.changes === 0) {
        return res.status(400).json({ error: 'This request has already been answered.' });
      }

      res.json({ booking: db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) });
    };
  }
  router.post('/api/bookings/:id/accept', respond('accepted'));
  router.post('/api/bookings/:id/decline', respond('declined'));

  // ---------------------------------------------------------------------
  // Mark a job complete: only the artisan, only once accepted
  // ---------------------------------------------------------------------
  router.post('/api/bookings/:id/complete', (req, res) => {
    if (!needLogin(req, res)) return;
    if (req.account.role !== 'artisan') {
      return res.status(403).json({ error: 'Only the artisan can mark a job complete.' });
    }

    const me = myProfile(req.account);
    const id = parseInt(req.params.id, 10);
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);

    if (!booking || !me || booking.artisan_id !== me.id) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    if (booking.status === 'completed') {
      return res.status(400).json({ error: 'This booking is already completed.' });
    }
    if (booking.status !== 'accepted') {
      return res.status(400).json({ error: 'Please accept the job before marking it complete.' });
    }

    db.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(id);

    const owner = db.prepare('SELECT account_id FROM clients WHERE id = ?').get(booking.client_id);
    notify(db, owner && owner.account_id, 'completed', 'Job completed',
      '"' + booking.title + '" is marked complete. Please leave a rating.', '/bookings');
    db.prepare(
      'UPDATE artisans SET total_jobs_completed = total_jobs_completed + 1 WHERE id = ?'
    ).run(booking.artisan_id);

    res.json({ booking: db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) });
  });

  return router;
};