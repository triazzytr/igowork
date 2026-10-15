const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

const jobs = [
  {
    file: 'server.js',
    backup: 'server.before-push.js',
    edits: [
      {
        name: 'connect push alerts',
        find: "app.use(require('./notifications')(db));",
        replace: "app.use(require('./notifications')(db));\napp.use(require('./push')(db));",
      },
    ],
  },
  {
    file: 'notifications.js',
    backup: 'notifications.before-push.js',
    edits: [
      {
        name: 'send a device alert with every notification',
        find: ').run(accountId, type, title, body || null, link || null);',
        replace: [
          ').run(accountId, type, title, body || null, link || null);',
          '',
          "    // Also alert the person's phone or computer (never blocks the caller)",
          "    require('./push').send(db, accountId, {",
          '      title: title,',
          "      body: body || '',",
          "      url: link || '/',",
          "      tag: type + ':' + (link || '')",
          '    });',
        ].join('\n'),
      },
    ],
  },
];

if (read('server.js').includes("require('./push')")) {
  console.log('This is already applied. Nothing to do.');
  process.exit(0);
}

try {
  require.resolve('web-push');
} catch (e) {
  console.log('The web-push library is not installed. Run: npm install web-push');
  process.exit(1);
}

const needed = [
  ['push.js', 'Create it first (step 3).'],
  ['sw.js', 'Create it first (step 4).'],
  ['vapid-keys.json', 'Run: node make-vapid-keys.js (step 5).'],
];
needed.forEach((n) => {
  if (!fs.existsSync(n[0])) {
    console.log('Missing file: ' + n[0] + '. ' + n[1]);
    process.exit(1);
  }
});

if (!read('notify.js').includes('/api/push/key')) {
  console.log('notify.js has not been replaced yet (step 6). Replace it, then run this again.');
  process.exit(1);
}

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

// Keep the private key out of GitHub
const ignore = fs.existsSync('.gitignore') ? read('.gitignore') : '';
if (!/^vapid-keys\.json$/m.test(ignore)) {
  fs.writeFileSync('.gitignore', ignore.replace(/\n*$/, '\n') + 'vapid-keys.json\n');
  console.log('Added vapid-keys.json to .gitignore');
}

console.log('Push alerts added.');