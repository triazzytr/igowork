const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

// ---------------------------------------------------------------------------
// What gets changed
//  1. The icon links get a version number (?v=2) so phones fetch the new icon
//     instead of remembering the old one (or a failed attempt).
//  2. The server also answers the two addresses phones ask for by default.
//  3. The manifest's icon addresses get the same version number.
// ---------------------------------------------------------------------------
const touchEdit = {
  name: 'home screen icon link',
  find: '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
  replace: '<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png?v=2">',
  done: 'apple-touch-icon.png?v=2',
};
const tabEdit = {
  name: 'tab icon link',
  find: 'href="/icons/favicon-32.png">',
  replace: 'href="/icons/favicon-32.png?v=2">',
  done: 'favicon-32.png?v=2',
  skipIfMissing: true,   // pages that never got the tab icon are left alone
};

const jobs = [
  {
    file: 'server.js',
    edits: [{
      name: 'icon addresses phones ask for',
      find: "app.use('/brand', express.static(__dirname + '/brand', { maxAge: '1d' }));",
      replace: [
        "app.use('/brand', express.static(__dirname + '/brand', { maxAge: '1d' }));",
        '',
        '// Phones and browsers often ask for these addresses directly',
        "app.get(['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png'], (req, res) => {",
        "  res.sendFile(__dirname + '/icons/apple-touch-icon.png');",
        '});',
        "app.get('/favicon.ico', (req, res) => {",
        "  res.type('png').sendFile(__dirname + '/icons/favicon-32.png');",
        '});',
      ].join('\n'),
      done: '/apple-touch-icon-precomposed.png',
    }],
  },
  { file: 'app.html', edits: [touchEdit, tabEdit] },
  { file: 'dashboard.html', edits: [touchEdit, tabEdit] },
  { file: 'login.html', edits: [touchEdit, tabEdit] },
  { file: 'bookings.js', edits: [touchEdit, tabEdit] },
  { file: 'chat.html', edits: [touchEdit, tabEdit] },
  { file: 'premium.html', optional: true, edits: [touchEdit, tabEdit] },
  { file: 'profile.html', optional: true, edits: [touchEdit, tabEdit] },
];

// The icons must exist
['icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/icon-192.png', 'icons/icon-512.png'].forEach((f) => {
  if (!fs.existsSync(f)) {
    console.log('Missing file: ' + f + '. Copy the logo icons into the icons folder first.');
    process.exit(1);
  }
});

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
    if (text.includes(e.done)) return;
    const count = text.split(e.find).length - 1;
    if (count === 0 && e.skipIfMissing) return;
    if (count !== 1) problems.push(job.file + ': ' + e.name);
    else todo.push(e);
  });
  if (todo.length) plan.push({ file: job.file, edits: todo });
});

// The manifest is JSON, so it is updated by reading it properly
let manifest = null;
if (fs.existsSync('manifest.webmanifest')) {
  try {
    const m = JSON.parse(read('manifest.webmanifest'));
    if ((m.icons || []).some((i) => !/\?v=2$/.test(i.src))) manifest = m;
  } catch (e) {
    problems.push('manifest.webmanifest: could not be read');
  }
}

if (problems.length > 0) {
  console.log('Could not safely find these parts, so nothing was changed:');
  problems.forEach((p) => console.log('  - ' + p));
  process.exit(1);
}

function backupName(file) {
  const dot = file.lastIndexOf('.');
  return file.slice(0, dot) + '.before-homeicon' + file.slice(dot);
}

if (plan.length === 0 && !manifest) {
  console.log('Already done. Nothing to do.');
}

plan.forEach((job) => {
  const original = read(job.file);
  const backup = backupName(job.file);
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, original);
  let updated = original;
  job.edits.forEach((e) => {
    updated = updated.replace(e.find, () => e.replace);
  });
  fs.writeFileSync(job.file, updated);
  console.log('Updated ' + job.file + ' (backup: ' + backup + ')');
});

if (manifest) {
  const backup = backupName('manifest.webmanifest');
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, read('manifest.webmanifest'));
  manifest.icons.forEach((i) => {
    if (!/\?v=2$/.test(i.src)) i.src += '?v=2';
  });
  fs.writeFileSync('manifest.webmanifest', JSON.stringify(manifest, null, 2) + '\n');
  console.log('Updated manifest.webmanifest (backup: ' + backup + ')');
}

if (plan.length || manifest) console.log('Home screen icon setup updated.');

skipped.forEach((f) => {
  console.log('Skipped ' + f + ' (not created yet). Run this script again after you create it.');
});