const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

const jobs = [
  {
    file: 'server.js',
    backup: 'server.before-photos.js',
    edits: [
      {
        name: 'connect photos',
        find: "app.use(require('./subscriptions')(db));",
        replace: "app.use(require('./photos')(db));\napp.use(require('./subscriptions')(db));",
      },
      {
        name: 'add photos to search results',
        find: "require('./subscriptions').annotate(db, results);",
        replace: "require('./photos').annotate(db, results);\n  require('./subscriptions').annotate(db, results);",
      },
    ],
  },
  {
    file: 'app.html',
    backup: 'app.before-photos.html',
    edits: [
      {
        name: 'photo on search cards',
        find: `<div class="avatar">' + esc(initials(a.full_name)) + '</div>'`,
        replace: `<div class="avatar">' + (a.photo_url ? '<img src="' + esc(a.photo_url) + '" alt="">' : esc(initials(a.full_name))) + '</div>'`,
      },
      {
        name: 'photo style',
        find: '</style>',
        replace: '.avatar{overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover;display:block}\n</style>',
      },
      {
        name: 'profile link (footer)',
        find: '<a href="/login">Account</a><a href="/bookings">My jobs</a>',
        replace: '<a href="/profile">Profile</a><a href="/bookings">My jobs</a>',
      },
      {
        name: 'profile link (header)',
        find: `<br><a href="/login">Account</a>'`,
        replace: `<br><a href="/profile">Profile</a>'`,
      },
    ],
  },
  {
    file: 'dashboard.html',
    backup: 'dashboard.before-photos.html',
    edits: [
      {
        name: "client's photo on job cards",
        find: `var html = '<div class="card"><div class="jtitle">' + esc(b.title) + '</div><div class="jmeta">Client: ' + esc(b.client_name) + '</div>';`,
        replace: [
          '// The client photo shows once the request has been accepted',
          `  var pic = b.status === 'pending' ? '' : '<img src="/api/bookings/' + b.id + '/photo" alt="" onerror="this.remove()" style="width:40px;height:40px;border-radius:50%;object-fit:cover;float:right;margin-left:12px">';`,
          `  var html = '<div class="card">' + pic + '<div class="jtitle">' + esc(b.title) + '</div><div class="jmeta">Client: ' + esc(b.client_name) + '</div>';`,
        ].join('\n'),
      },
      {
        name: 'profile link in the header',
        find: '<br><a href="#" id="logout">Log out</a>',
        replace: '<br><a href="/profile">Profile</a> &middot; <a href="#" id="logout">Log out</a>',
      },
    ],
  },
  {
    file: 'bookings.js',
    backup: 'bookings.before-photos.js',
    edits: [
      {
        name: "artisan's photo on job cards",
        find: `'<div class="jmeta">Artisan: ' + esc(b.artisan_name) + '</div>'`,
        replace: `'<div class="jmeta"><img src="/api/bookings/' + b.id + '/photo" alt="" onerror="this.remove()" style="width:22px;height:22px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px">Artisan: ' + esc(b.artisan_name) + '</div>'`,
      },
      {
        name: 'profile link on My jobs',
        find: '<a href="/app">Find artisans</a><a href="#" id="logout">Log out</a>',
        replace: '<a href="/app">Find artisans</a><a href="/profile">Profile</a><a href="#" id="logout">Log out</a>',
      },
    ],
  },
];

if (fs.existsSync('server.js') && read('server.js').includes("require('./photos')")) {
  console.log('This is already applied. Nothing to do.');
  process.exit(0);
}

['photos.js', 'profile.html'].forEach((f) => {
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

console.log('Profile photos added.');