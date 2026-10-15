const fs = require('fs');
const webpush = require('web-push');

if (fs.existsSync('vapid-keys.json')) {
  console.log('vapid-keys.json already exists, so nothing was changed.');
  console.log('(Keep using the same keys. Changing them makes everyone re-enable alerts.)');
  process.exit(0);
}

const keys = webpush.generateVAPIDKeys();
fs.writeFileSync('vapid-keys.json', JSON.stringify(keys, null, 2) + '\n');

console.log('Keys saved to vapid-keys.json');
console.log('Public key: ' + keys.publicKey);
console.log('');
console.log('The PRIVATE key in that file is a secret. Never share it or put it on GitHub.');