const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

const jobs = [
  {
    file: 'server.js',
    backup: 'server.before-deploy.js',
    edits: [
      {
        name: 'use the host\'s assigned port',
        find: 'const PORT = 3000;',
        replace: [
          "// Hosting providers assign their own port; 3000 is only the fallback for your computer",
          'const PORT = process.env.PORT || 3000;',
        ].join('\n'),
      },
      {
        name: 'trust the host\'s proxy (for correct visitor IPs and https detection)',
        find: 'const app = express();',
        replace: [
          'const app = express();',
          "app.set('trust proxy', 1);",
        ].join('\n'),
      },
    ],
  },
  {
    file: 'auth.js',
    backup: 'auth.before-deploy.js',
    edits: [
      {
        name: 'secure cookie flag (login)',
        find: "COOKIE + '=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + SESSION_DAYS * 86400",
        replace: [
          "COOKIE + '=' + token + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + SESSION_DAYS * 86400 +",
          "        (process.env.NODE_ENV === 'production' ? '; Secure' : '')",
        ].join('\n'),
      },
      {
        name: 'secure cookie flag (logout)',
        find: "COOKIE + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'",
        replace: "COOKIE + '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' + (process.env.NODE_ENV === 'production' ? '; Secure' : '')",
      },
    ],
  },
];

if (read('server.js').includes("trust proxy")) {
  console.log('This is already applied. Nothing to do.');
  process.exit(0);
}

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

// Add a "start" script to package.json, which hosting providers look for
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.scripts = pkg.scripts || {};
pkg.scripts.start = 'node server.js';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('Updated package.json (added a start script)');

console.log('Ready for deployment.');