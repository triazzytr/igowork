const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

const BADGE_CSS =
  '.prem{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:999px;font-size:11px;' +
  'font-weight:700;vertical-align:middle;background:rgba(255,159,10,.16);color:#d98200}\n</style>';

const jobs = [
  {
    file: 'server.js',
    backup: 'server.before-premium.js',
    edits: [
      {
        name: 'connect Premium (before bookings)',
        find: "app.use(require('./bookings')(db));",
        replace: "app.use(require('./subscriptions')(db));\napp.use(require('./bookings')(db));",
      },
      {
        name: 'mark Premium artisans in search results',
        find: 'res.json({ count: results.length, artisans: results });',
        replace: [
          '// Mark Premium artisans, and keep private details (exact location, internal ids) out of the list',
          "  require('./subscriptions').annotate(db, results);",
          '  res.json({ count: results.length, artisans: results });',
        ].join('\n'),
      },
    ],
  },
  {
    file: 'app.html',
    backup: 'app.before-premium.html',
    edits: [
      {
        name: 'Premium badge next to the name',
        find: `esc(a.full_name) + '</div><div class="rtrade">'`,
        replace: `esc(a.full_name) + (a.is_premium ? ' <span class="prem">Premium</span>' : '') + '</div><div class="rtrade">'`,
      },
      {
        name: 'badge style',
        find: '</style>',
        replace: BADGE_CSS,
      },
    ],
  },
  {
    file: 'dashboard.html',
    backup: 'dashboard.before-premium.html',
    edits: [
      {
        name: 'plan card on the dashboard',
        find: '</body>',
        replace: '<script src="/premium-ui.js"></script>\n</body>',
      },
    ],
  },
];

if (fs.existsSync('server.js') && read('server.js').includes("require('./subscriptions')")) {
  console.log('This is already applied. Nothing to do.');
  process.exit(0);
}

['subscriptions.js', 'premium.html', 'premium-ui.js'].forEach((f) => {
  if (!fs.existsSync(f)) {
    console.log('Missing file: ' + f + '. Create it first, then run this again.');
    process.exit(1);
  }
});

// Check every piece can be found exactly once BEFORE changing anything
const problems = [];
jobs.forEach((job) => {
  if (!fs.existsSync(job.file)) { problems.push(job.file + ': file not found'); return; }
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

console.log('Premium added.');