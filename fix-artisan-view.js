const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

const jobs = [
  {
    file: 'server.js',
    backup: 'server.before-artisan-fix.js',
    edits: [
      {
        name: 'remove the late login hookup',
        find: "app.use(require('./auth')(db));\n",
        replace: '',
      },
      {
        name: 'check who is logged in before any route',
        find: 'app.use(express.json());',
        replace: [
          'app.use(express.json());',
          '',
          '// Work out who is logged in before any route runs',
          "app.use(require('./auth')(db));",
        ].join('\n'),
      },
      {
        name: 'hide my own profile from search',
        find: "  const artisans = db.prepare('SELECT * FROM artisans WHERE is_available = 1').all();",
        replace: [
          '  // An artisan never sees their own profile in the list',
          "  const myAccountId = req.account && req.account.role === 'artisan' ? req.account.id : -1;",
          '  const artisans = db.prepare(',
          "    'SELECT * FROM artisans WHERE is_available = 1 AND (account_id IS NULL OR account_id != ?)'",
          '  ).all(myAccountId);',
        ].join('\n'),
      },
    ],
  },
  {
    file: 'app.html',
    backup: 'app.before-artisan-fix.html',
    edits: [
      {
        name: 'account badge in the header',
        find: '<header><div class="logo"><div class="mark">IG</div>IGOwork</div></header>',
        replace: '<header><div class="logo"><div class="mark">IG</div>IGOwork<div id="acct" class="acct"></div></div></header>',
      },
      {
        name: 'badge styling',
        find: '</style>',
        replace: [
          '.acct{margin-left:auto;font-size:13px;font-weight:400;text-align:right;line-height:1.4}',
          '.acct a{color:var(--blue);text-decoration:none}',
          '.role{display:inline-block;background:rgba(0,122,255,.12);color:var(--blue);border-radius:8px;padding:2px 8px;font-size:12px;font-weight:600;text-transform:capitalize;margin-left:4px}',
          '</style>',
        ].join('\n'),
      },
      {
        name: 'show who is logged in',
        find: '\nsearch();\n</script>',
        replace: [
          '',
          "fetch('/api/me').then(function (r) { return r.json(); }).then(function (j) {",
          '  var a = j.account;',
          "  $('acct').innerHTML = a",
          "    ? esc(a.full_name) + ' <span class=\"role\">' + esc(a.role) + '</span><br><a href=\"/login\">Account</a>'",
          "    : '<a href=\"/login\">Log in</a>';",
          '});',
          '',
          'search();',
          '</script>',
        ].join('\n'),
      },
    ],
  },
];

if (read('server.js').includes('An artisan never sees their own profile')) {
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

console.log('Done.');