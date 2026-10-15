const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

const SCRIPT_TAG = '<script src="/notify.js"></script>\n</body>';

const jobs = [
  {
    file: 'server.js',
    backup: 'server.before-notify.js',
    edits: [
      {
        name: 'connect notifications',
        find: "app.use(require('./dashboard')(db));",
        replace: "app.use(require('./notifications')(db));\napp.use(require('./dashboard')(db));",
      },
    ],
  },
  {
    file: 'bookings.js',
    backup: 'bookings.before-notify.js',
    edits: [
      {
        name: 'load the notifier',
        find: "const express = require('express');",
        replace: "const express = require('express');\nconst { notify } = require('./notifications');",
      },
      {
        name: 'notify the artisan of a new request',
        find: 'res.status(201).json({ booking });',
        replace: `// Tell the artisan a new request has arrived
    const target = db.prepare('SELECT account_id FROM artisans WHERE id = ?').get(artisan.id);
    notify(db, target && target.account_id, 'request', 'New booking request',
      req.account.full_name + ': ' + String(b.title).trim().slice(0, 80), '/dashboard');

    res.status(201).json({ booking });`,
      },
      {
        name: 'notify the client when a request is accepted or declined',
        find: 'if (result.changes === 0) {',
        replace: `if (result.changes > 0) {
        const owner = db.prepare('SELECT account_id FROM clients WHERE id = ?').get(booking.client_id);
        if (newStatus === 'accepted') {
          notify(db, owner && owner.account_id, 'accepted', 'Booking accepted',
            req.account.full_name + ' accepted "' + booking.title + '". You can message them now.', '/chat/' + id);
        } else {
          notify(db, owner && owner.account_id, 'declined', 'Request declined',
            req.account.full_name + ' could not take "' + booking.title + '".', '/bookings');
        }
      }
      if (result.changes === 0) {`,
      },
      {
        name: 'notify the client when a job is completed',
        find: `db.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(id);`,
        replace: `db.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(id);

    const owner = db.prepare('SELECT account_id FROM clients WHERE id = ?').get(booking.client_id);
    notify(db, owner && owner.account_id, 'completed', 'Job completed',
      '"' + booking.title + '" is marked complete. Please leave a rating.', '/bookings');`,
      },
      {
        name: 'bell on the My jobs page',
        find: '</body>',
        replace: SCRIPT_TAG,
      },
    ],
  },
  {
    file: 'chat.js',
    backup: 'chat.before-notify.js',
    edits: [
      {
        name: 'load the notifier',
        find: "const express = require('express');",
        replace: "const express = require('express');\nconst { notify } = require('./notifications');",
      },
      {
        name: 'opening a chat clears its notifications',
        find: 'const after = parseInt(req.query.after, 10) || 0;',
        replace: `// Opening the chat clears its notifications
    db.prepare('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE account_id = ? AND link = ? AND read_at IS NULL')
      .run(req.account.id, '/chat/' + job.booking.id);

    const after = parseInt(req.query.after, 10) || 0;`,
      },
      {
        name: 'notify the other person of a new message',
        find: 'res.status(201).json({ id: Number(result.lastInsertRowid) });',
        replace: `// Tell the other person about the new message
    const recipient = job.side === 'client' ? job.booking.artisan_account : job.booking.client_account;
    notify(db, recipient, 'message', 'New message from ' + req.account.full_name,
      body.slice(0, 80), '/chat/' + job.booking.id);

    res.status(201).json({ id: Number(result.lastInsertRowid) });`,
      },
    ],
  },
  {
    file: 'app.html',
    backup: 'app.before-notify.html',
    edits: [
      { name: 'bell on the search screen', find: '</body>', replace: SCRIPT_TAG },
    ],
  },
  {
    file: 'dashboard.html',
    backup: 'dashboard.before-notify.html',
    edits: [
      { name: 'bell on the artisan dashboard', find: '</body>', replace: SCRIPT_TAG },
    ],
  },
];

if (read('server.js').includes("require('./notifications')")) {
  console.log('This is already applied. Nothing to do.');
  process.exit(0);
}

['notifications.js', 'notify.js'].forEach((f) => {
  if (!fs.existsSync(f)) {
    console.log('Missing file: ' + f + '. Create it first (steps 2 and 3), then run this again.');
    process.exit(1);
  }
});

// Check every piece can be found exactly once BEFORE changing anything
const problems = [];
jobs.forEach((job) => {
  const text = read(job.file);
  job.edits.forEach((e) => {
    if (text.split(e.find).length - 1 !== 1) problems.push(job.file + ': ' + e.name);
  });
});
if (problems.length > 0) {
  console.log('Could not safely find these parts, so nothing was changed:');
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

console.log('Notifications added.');