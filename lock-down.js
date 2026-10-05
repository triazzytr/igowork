const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

const jobs = [
  {
    file: 'server.js',
    backup: 'server.before-lockdown.js',
    edits: [
      {
        name: 'close the open add-artisan page',
        find: "app.get('/add', (req, res) => {\n  res.send(ADD_PAGE);",
        replace: "app.get('/add', (req, res) => {\n  return res.redirect('/login');",
      },
      {
        name: 'close the open add-artisan API',
        find: "app.post('/api/artisans', (req, res) => {\n  const b = req.body || {};",
        replace:
          "app.post('/api/artisans', (req, res) => {\n" +
          "  return res.status(403).json({ error: 'Artisans now join by signing up at /login.' });\n" +
          "  const b = req.body || {};",
      },
    ],
  },
  {
    file: 'app.html',
    backup: 'app.before-lockdown.html',
    edits: [
      {
        name: 'footer links',
        find: '<a href="/add">Add artisan</a><a href="/bookings">Bookings</a><a href="/ratings">Ratings</a>',
        replace: '<a href="/login">Account</a><a href="/bookings">My jobs</a>',
      },
    ],
  },
];

if (read('server.js').includes("res.redirect('/login')")) {
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

console.log('Open pages locked down.');