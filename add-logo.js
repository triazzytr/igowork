const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

// ---------------------------------------------------------------------------
// What gets added
// ---------------------------------------------------------------------------
const OLD_LOGO = '<div class="mark">IG</div><div class="brand">IGOwork</div>';
const NEW_LOGO =
  '<a href="/app" style="display:flex;align-items:center;flex:none">' +
  '<picture><source srcset="/brand/logo-wordmark-dark.png" media="(prefers-color-scheme: dark)">' +
  '<img src="/brand/logo-wordmark.png" alt="IGOwork" style="height:30px;width:auto;display:block"></picture></a>';

const TOUCH_ICON = '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">';
const FAVICON = TOUCH_ICON + '\n<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">';

const headerEdit = { name: 'logo in the header', find: OLD_LOGO, replace: NEW_LOGO, done: '/brand/logo-wordmark.png' };
const faviconEdit = { name: 'tab icon', find: TOUCH_ICON, replace: FAVICON, done: 'favicon-32.png' };

// optional: true means "skip quietly if this file does not exist yet"
const jobs = [
  {
    file: 'server.js',
    edits: [{
      name: 'serve the logo files',
      find: "app.use('/icons', express.static(__dirname + '/icons', { maxAge: '1d' }));",
      replace:
        "app.use('/icons', express.static(__dirname + '/icons', { maxAge: '1d' }));\n" +
        "app.use('/brand', express.static(__dirname + '/brand', { maxAge: '1d' }));",
      done: "'/brand'",
    }],
  },
  { file: 'app.html', edits: [headerEdit, faviconEdit] },
  { file: 'dashboard.html', edits: [headerEdit, faviconEdit] },
  { file: 'login.html', edits: [headerEdit, faviconEdit] },
  { file: 'bookings.js', edits: [headerEdit, faviconEdit] },
  { file: 'chat.html', edits: [faviconEdit] },
  { file: 'premium.html', optional: true, edits: [headerEdit, faviconEdit] },
  { file: 'profile.html', optional: true, edits: [headerEdit, faviconEdit] },
  {
    file: 'sw.js',
    edits: [{
      name: 'logo on phone alerts',
      find: "body: data.body || '',",
      replace: "body: data.body || '',\n    icon: '/icons/icon-192.png',",
      done: "icon: '/icons/icon-192.png'",
    }],
  },
];

// The logo files must be unpacked first
['brand/logo-wordmark.png', 'brand/logo-wordmark-dark.png', 'icons/icon-192.png', 'icons/favicon-32.png'].forEach((f) => {
  if (!fs.existsSync(f)) {
    console.log('Missing file: ' + f);
    console.log('Unpack igowork-brand.zip into this folder first (step 2), then run this again.');
    process.exit(1);
  }
});

// Work out what still needs doing, and check every piece can be found exactly once
const plan = [];
const problems = [];
const skipped = [];
jobs.forEach((job) => {
  if (!fs.existsSync(job.file)) {
    if (job.optional) skipped.push(job.file);
    else problems.push(job.file + ': file not found');
    return;
  }
  const text = read(job.file);
  const todo = [];
  job.edits.forEach((e) => {
    if (text.includes(e.done)) return; // already done
    if (text.split(e.find).length - 1 !== 1) problems.push(job.file + ': ' + e.name);
    else todo.push(e);
  });
  if (todo.length) plan.push({ file: job.file, edits: todo });
});

if (problems.length > 0) {
  console.log('Could not safely find these parts, so nothing was changed:');
  problems.forEach((p) => console.log('  - ' + p));
  process.exit(1);
}

if (plan.length === 0) {
  console.log('The logo is already in place. Nothing to do.');
} else {
  plan.forEach((job) => {
    const dot = job.file.lastIndexOf('.');
    const backup = job.file.slice(0, dot) + '.before-logo' + job.file.slice(dot);
    const original = read(job.file);
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, original);
    let updated = original;
    job.edits.forEach((e) => {
      updated = updated.replace(e.find, () => e.replace);
    });
    fs.writeFileSync(job.file, updated);
    console.log('Updated ' + job.file + ' (backup: ' + backup + ')');
  });
  console.log('Logo added.');
}

skipped.forEach((f) => {
  console.log('Skipped ' + f + ' (not created yet). Run this script again after you create it.');
});