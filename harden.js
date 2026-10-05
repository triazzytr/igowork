const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

const jobs = [
  {
    file: 'auth.js',
    backup: 'auth.before-harden.js',
    edits: [
      {
        name: 'rate limit tracking (in memory)',
        find: `module.exports = function (db) {
  const router = express.Router();
  const COOKIE = 'igowork_session';
  const SESSION_DAYS = 30;`,
        replace: `module.exports = function (db) {
  const router = express.Router();
  const COOKIE = 'igowork_session';
  const SESSION_DAYS = 30;

  // Simple in-memory rate limiting: blocks repeated login/signup attempts
  // from the same IP address. Resets if the server restarts.
  const ATTEMPT_LIMIT = 8;
  const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  const attempts = new Map();

  function tooManyAttempts(req) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const record = attempts.get(ip) || { count: 0, since: now };
    if (now - record.since > ATTEMPT_WINDOW_MS) {
      record.count = 0;
      record.since = now;
    }
    record.count += 1;
    attempts.set(ip, record);
    return record.count > ATTEMPT_LIMIT;
  }`,
      },
      {
        name: 'limit on signup',
        find: `router.post('/api/signup', (req, res) => {
    const b = req.body || {};`,
        replace: `router.post('/api/signup', (req, res) => {
    if (tooManyAttempts(req)) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    const b = req.body || {};`,
      },
      {
        name: 'limit on login',
        find: `router.post('/api/login', (req, res) => {
    const b = req.body || {};`,
        replace: `router.post('/api/login', (req, res) => {
    if (tooManyAttempts(req)) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    const b = req.body || {};`,
      },
    ],
  },
  {
    file: 'server.js',
    backup: 'server.before-harden.js',
    edits: [
      {
        name: 'trim fields from the public artisan list',
        find: `  const artisans = db.prepare('SELECT * FROM artisans').all();
  res.json({ count: artisans.length, artisans });`,
        replace: `  const artisans = db.prepare(\`
    SELECT id, full_name, trade_category, years_of_experience, service_fee,
           average_rating, total_ratings, total_jobs_completed, is_available
    FROM artisans
  \`).all();
  res.json({ count: artisans.length, artisans });`,
      },
    ],
  },
];

if (read('auth.js').includes('ATTEMPT_LIMIT')) {
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

console.log('Hardening applied.');