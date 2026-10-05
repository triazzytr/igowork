const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

const jobs = [
  {
    file: 'server.js',
    backup: 'server.before-dashboard.js',
    edits: [
      {
        name: 'send artisans from the search screen to their dashboard',
        find: "app.get('/app', (req, res) => res.sendFile(__dirname + '/app.html'));",
        replace: [
          "app.get('/app', (req, res) => {",
          '  // Artisans use their own dashboard, not the client search screen',
          "  if (req.account && req.account.role === 'artisan') return res.redirect('/dashboard');",
          "  res.sendFile(__dirname + '/app.html');",
          '});',
        ].join('\n'),
      },
      {
        name: 'block artisans from searching other artisans',
        find: "app.get('/api/search', (req, res) => {",
        replace: [
          "app.get('/api/search', (req, res) => {",
          "  if (req.account && req.account.role === 'artisan') {",
          "    return res.status(403).json({ error: 'Artisan accounts cannot browse other artisans.' });",
          '  }',
        ].join('\n'),
      },
      {
        name: 'block artisans from the artisan list',
        find: "app.get('/api/artisans', (req, res) => {",
        replace: [
          "app.get('/api/artisans', (req, res) => {",
          "  if (req.account && req.account.role === 'artisan') {",
          "    return res.status(403).json({ error: 'Artisan accounts cannot browse other artisans.' });",
          '  }',
        ].join('\n'),
      },
      {
        name: 'connect the dashboard',
        find: "app.use(require('./bookings')(db));",
        replace: "app.use(require('./dashboard')(db));\napp.use(require('./bookings')(db));",
      },
    ],
  },
  {
    file: 'login.html',
    backup: 'login.before-dashboard.html',
    edits: [
      {
        name: 'send artisans to their dashboard after login',
        find: "$('welcome').style.display = 'block';",
        replace: "if (a.role === 'artisan') { location.href = '/dashboard'; return; }\n  $('welcome').style.display = 'block';",
      },
    ],
  },
];

if (read('server.js').includes("require('./dashboard')")) {
  console.log('This is already applied. Nothing to do.');
  process.exit(0);
}

['dashboard.js', 'dashboard.html'].forEach((f) => {
  if (!fs.existsSync(f)) {
    console.log('Missing file: ' + f + '. Create it first (steps 2 and 3), then run this again.');
    process.exit(1);
  }
});

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

console.log('Artisan dashboard connected.');