const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

const jobs = [
  {
    file: 'bookings.js',
    backup: 'bookings.before-accept.js',
    edits: [
      {
        name: 'status message on the client page',
        find: `html += '<div class="row muted">Waiting for the artisan to finish the job.</div>';`,
        replace: `html += '<div class="row muted">' + (b.status === 'pending' ? 'Waiting for the artisan to respond.' : b.status === 'accepted' ? 'Accepted. Waiting for the artisan to finish the job.' : 'The artisan declined this request.') + '</div>';`,
      },
      {
        name: 'only accepted jobs can be completed',
        find: `db.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(id);`,
        replace: `if (booking.status !== 'accepted') {
      return res.status(400).json({ error: 'Please accept the job before marking it complete.' });
    }

    db.prepare("UPDATE bookings SET status = 'completed' WHERE id = ?").run(id);`,
      },
      {
        name: 'accept and decline routes',
        find: `return router;`,
        replace: `// Accept or decline a request: only the artisan on that job, only while pending
  function respond(newStatus) {
    return (req, res) => {
      if (!needLogin(req, res)) return;
      if (req.account.role !== 'artisan') {
        return res.status(403).json({ error: 'Only the artisan can respond to a request.' });
      }

      const me = myProfile(req.account);
      const id = parseInt(req.params.id, 10);
      const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);

      // Same message whether it doesn't exist or isn't yours
      if (!booking || !me || booking.artisan_id !== me.id) {
        return res.status(404).json({ error: 'Booking not found.' });
      }

      // The WHERE clause makes sure a request can only be answered once
      const result = db.prepare(
        "UPDATE bookings SET status = ? WHERE id = ? AND status = 'pending'"
      ).run(newStatus, id);
      if (result.changes === 0) {
        return res.status(400).json({ error: 'This request has already been answered.' });
      }

      res.json({ booking: db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) });
    };
  }

  router.post('/api/bookings/:id/accept', respond('accepted'));
  router.post('/api/bookings/:id/decline', respond('declined'));

  return router;`,
      },
    ],
  },
  {
    file: 'dashboard.html',
    backup: 'dashboard.before-accept.html',
    edits: [
      {
        name: 'decline button style',
        find: `#msg{margin-top:12px;font-weight:600;min-height:20px}`,
        replace: `#msg{margin-top:12px;font-weight:600;min-height:20px}
button.decline{background:var(--card);color:#d70015;border:1px solid var(--line);margin-left:8px}`,
      },
      {
        name: 'accepted jobs section',
        find: `<h2>Completed jobs</h2>`,
        replace: `<h2>Accepted jobs</h2>
  <div id="active"></div>

  <h2>Completed jobs</h2>`,
      },
      {
        name: 'accept and decline buttons',
        find: `html += '<div class="row"><button data-act="complete" data-id="' + b.id + '">Mark complete</button></div>';`,
        replace: `if (b.status === 'pending') {
      html += '<div class="row"><button data-act="accept" data-id="' + b.id + '">Accept</button>' +
        '<button class="decline" data-act="decline" data-id="' + b.id + '">Decline</button></div>';
    } else {
      html += '<div class="row"><button data-act="complete" data-id="' + b.id + '">Mark complete</button></div>';
    }`,
      },
      {
        name: 'sort jobs into sections',
        find: `var pending = j.bookings.filter(function (b) { return b.status !== 'completed'; });`,
        replace: `var pending = j.bookings.filter(function (b) { return b.status === 'pending'; });
    var active = j.bookings.filter(function (b) { return b.status === 'accepted'; });`,
      },
      {
        name: 'show accepted jobs',
        find: `$('done').innerHTML = done.length`,
        replace: `$('active').innerHTML = active.length
      ? active.map(card).join('')
      : '<div class="empty">No accepted jobs in progress.</div>';
    $('done').innerHTML = done.length`,
      },
      {
        name: 'button actions',
        find: `if (act === 'complete') {`,
        replace: `if (act === 'accept' || act === 'decline') {
    post('/api/bookings/' + id + '/' + act).then(function (j) {
      say(j.error ? j.error : 'Job #' + id + (act === 'accept' ? ' accepted.' : ' declined.'), !!j.error);
      loadJobs();
    });
  } else if (act === 'complete') {`,
      },
    ],
  },
];

if (read('bookings.js').includes("respond('accepted')")) {
  console.log('This is already applied. Nothing to do.');
  process.exit(0);
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

console.log('Accept and decline added.');