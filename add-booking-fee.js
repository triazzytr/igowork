const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

const jobs = [
  {
    file: 'auth.js',
    backup: 'auth.before-fee.js',
    edits: [
      {
        name: 'phone column',
        find: `addColumnIfMissing('artisans', 'account_id');`,
        replace: `addColumnIfMissing('artisans', 'account_id');

  // Phone numbers: private until a booking fee is paid
  if (!db.prepare('PRAGMA table_info(accounts)').all().some((c) => c.name === 'phone')) {
    db.exec('ALTER TABLE accounts ADD COLUMN phone TEXT');
  }`,
      },
      {
        name: 'read the phone number',
        find: `const role = b.role;`,
        replace: `const role = b.role;
    const phone = String(b.phone || '').replace(/[^0-9+]/g, '');`,
      },
      {
        name: 'check the phone number',
        find: `if (!name) return res.status(400).json({ error: 'Please enter your name.' });`,
        replace: `if (!name) return res.status(400).json({ error: 'Please enter your name.' });
    if (!/^[+]?[0-9]{10,15}$/.test(phone)) {
      return res.status(400).json({ error: 'Please enter a valid phone number, for example 08012345678.' });
    }`,
      },
      {
        name: 'save the phone number (columns)',
        find: `'INSERT INTO accounts (email, password_hash, role, full_name) VALUES (?, ?, ?, ?)'`,
        replace: `'INSERT INTO accounts (email, password_hash, role, full_name, phone) VALUES (?, ?, ?, ?, ?)'`,
      },
      {
        name: 'save the phone number (value)',
        find: `.run(email, hashPassword(password), role, name);`,
        replace: `.run(email, hashPassword(password), role, name, phone);`,
      },
    ],
  },
  {
    file: 'login.html',
    backup: 'login.before-fee.html',
    edits: [
      {
        name: 'phone field on the sign-up form',
        find: `<label>Full name<input name="full_name" autocomplete="name" required></label>`,
        replace: `<label>Full name<input name="full_name" autocomplete="name" required></label>
      <label>Phone number (shared only after the booking fee is paid)<input name="phone" type="tel" autocomplete="tel" placeholder="e.g. 08012345678" required></label>`,
      },
    ],
  },
  {
    file: 'bookings.js',
    backup: 'bookings.before-fee.js',
    edits: [
      {
        name: 'load the fee amount',
        find: `const express = require('express');`,
        replace: `const express = require('express');
const { BOOKING_FEE } = require('./payments');`,
      },
      {
        name: 'phone helper on the client page',
        find: `function card(b) {`,
        replace: `function contact(b) {
    return '<div class="row">Phone: ' + (b.contact_phone
      ? '<a href="tel:' + esc(b.contact_phone) + '">' + esc(b.contact_phone) + '</a>'
      : '<span class="muted">not on file yet</span>') + '</div>';
  }

  function card(b) {`,
      },
      {
        name: 'fee variable on the client page',
        find: `var role = null;`,
        replace: `var role = null;
  var fee = '';`,
      },
      {
        name: 'fee label on the client page',
        find: `role = j.role;`,
        replace: `role = j.role;
      fee = String.fromCharCode(8358) + Number(j.booking_fee).toLocaleString('en-NG');`,
      },
      {
        name: 'pay button and phone on the client page',
        find: `html += '<div class="row muted">' + (b.status === 'pending' ? 'Waiting for the artisan to respond.' : b.status === 'accepted' ? 'Accepted. Waiting for the artisan to finish the job.' : 'The artisan declined this request.') + '</div>';`,
        replace: `if (b.status === 'accepted' && !b.fee_paid_at) {
          html += '<div class="row">The artisan accepted! Pay the booking fee to unlock contact details.</div>' +
            '<div class="row"><button data-act="pay" data-id="' + b.id + '">Pay booking fee (' + fee + ')</button></div>';
        } else if (b.status === 'accepted') {
          html += contact(b) + '<div class="row muted">Waiting for the artisan to finish the job.</div>';
        } else {
          html += '<div class="row muted">' + (b.status === 'pending' ? 'Waiting for the artisan to respond.' : 'The artisan declined this request.') + '</div>';
        }`,
      },
      {
        name: 'pay button action',
        find: `if (act === 'complete') {`,
        replace: `if (act === 'pay') {
      post('/api/bookings/' + id + '/pay').then(function (j) {
        say(j.error ? j.error : j.message, !!j.error);
        loadJobs();
      });
    } else if (act === 'complete') {`,
      },
      {
        name: 'payment status and phone numbers in the job list',
        find: `SELECT b.id, b.title, b.status, b.created_at,`,
        replace: `SELECT b.id, b.title, b.status, b.created_at,
             (SELECT created_at FROM payments p WHERE p.booking_id = b.id) AS fee_paid_at,
             (SELECT phone FROM accounts WHERE id = a.account_id) AS artisan_phone,
             (SELECT phone FROM accounts WHERE id = c.account_id) AS client_phone,`,
      },
      {
        name: 'hide phone numbers until the fee is paid',
        find: `res.json({ role: req.account.role, count: bookings.length, bookings });`,
        replace: `// Contact details stay hidden until the booking fee is paid.
    // Each side only ever receives the OTHER side's number.
    bookings.forEach((bk) => {
      bk.contact_phone = bk.fee_paid_at ? (isClient ? bk.artisan_phone : bk.client_phone) : null;
      delete bk.artisan_phone;
      delete bk.client_phone;
    });

    res.json({ role: req.account.role, count: bookings.length, bookings, booking_fee: BOOKING_FEE });`,
      },
      {
        name: 'completing a job needs the fee paid',
        find: `db.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(id);`,
        replace: `if (!db.prepare('SELECT id FROM payments WHERE booking_id = ?').get(id)) {
      return res.status(400).json({ error: 'The client has not paid the booking fee yet.' });
    }

    db.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(id);`,
      },
    ],
  },
  {
    file: 'dashboard.html',
    backup: 'dashboard.before-fee.html',
    edits: [
      {
        name: 'phone helper on the dashboard',
        find: `function card(b) {`,
        replace: `function contact(b) {
  return '<div class="row">Phone: ' + (b.contact_phone
    ? '<a href="tel:' + esc(b.contact_phone) + '">' + esc(b.contact_phone) + '</a>'
    : '<span class="muted">not on file yet</span>') + '</div>';
}

function card(b) {`,
      },
      {
        name: 'waiting for payment, then phone and complete button',
        find: `html += '<div class="row"><button data-act="complete" data-id="' + b.id + '">Mark complete</button></div>';`,
        replace: `if (!b.fee_paid_at) {
        html += '<div class="row muted">Waiting for the client to pay the booking fee. Contact details unlock after payment.</div>';
      } else {
        html += contact(b) + '<div class="row"><button data-act="complete" data-id="' + b.id + '">Mark complete</button></div>';
      }`,
      },
    ],
  },
  {
    file: 'server.js',
    backup: 'server.before-fee.js',
    edits: [
      {
        name: 'connect payments',
        find: `app.use(require('./bookings')(db));`,
        replace: `app.use(require('./payments')(db));
app.use(require('./bookings')(db));`,
      },
    ],
  },
];

if (read('bookings.js').includes("require('./payments')")) {
  console.log('This is already applied. Nothing to do.');
  process.exit(0);
}

if (!read('bookings.js').includes("respond('accepted')")) {
  console.log('Please do Step 19 (accept and decline) first, then run this again.');
  process.exit(1);
}

if (!fs.existsSync('payments.js')) {
  console.log('Missing file: payments.js. Create it first (step 2), then run this again.');
  process.exit(1);
}

// Check every piece can be found BEFORE changing anything
const problems = [];
jobs.forEach((job) => {
  const text = read(job.file);
  job.edits.forEach((e) => {
    if (!text.includes(e.find)) problems.push(job.file + ': ' + e.name);
  });
});
if (problems.length > 0) {
  console.log('Could not find these parts, so nothing was changed:');
  problems.forEach((p) => console.log('  - ' + p));
  process.exit(1);
}

jobs.forEach((job) => {
  const original = read(job.file);
  fs.writeFileSync(job.backup, original);
  let updated = original;
  job.edits.forEach((e) => {
    updated = updated.replace(e.find, () => e.replace);
  });
  fs.writeFileSync(job.file, updated);
  console.log('Updated ' + job.file + ' (backup: ' + job.backup + ')');
});

console.log('Booking fee and contact reveal added.');