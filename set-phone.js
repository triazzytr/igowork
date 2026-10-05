const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('igowork.db');

// Make sure the phone column exists
if (!db.prepare('PRAGMA table_info(accounts)').all().some((c) => c.name === 'phone')) {
  db.exec('ALTER TABLE accounts ADD COLUMN phone TEXT');
}

const email = String(process.argv[2] || '').trim().toLowerCase();
const phone = String(process.argv[3] || '').replace(/[^0-9+]/g, '');

if (!email || !/^[+]?[0-9]{10,15}$/.test(phone)) {
  console.log('Usage: node set-phone.js email phone');
  console.log('Example: node set-phone.js ireti@example.com 08012345678');
  process.exit(1);
}

const result = db.prepare('UPDATE accounts SET phone = ? WHERE email = ?').run(phone, email);
console.log(result.changes ? 'Phone saved for ' + email : 'No account found with that email.');