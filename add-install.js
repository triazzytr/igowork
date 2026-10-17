const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

// ---------------------------------------------------------------------------
// 1. What gets added to every page's <head>
// ---------------------------------------------------------------------------
const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">';
const HEAD_TAGS = [
  VIEWPORT,
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="IGOwork">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)">',
  '<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">',
].join('\n');

const SERVER_ROUTES = [
  'app.use(express.json());',
  '',
  '// Installable app: the manifest and icons are public (no login needed)',
  "app.get('/manifest.webmanifest', (req, res) => {",
  "  res.set('Cache-Control', 'no-cache');",
  "  res.type('application/manifest+json');",
  "  res.sendFile(__dirname + '/manifest.webmanifest');",
  '});',
  "app.use('/icons', express.static(__dirname + '/icons', { maxAge: '1d' }));",
].join('\n');

const jobs = [
  {
    file: 'server.js',
    backup: 'server.before-install.js',
    edits: [{ name: 'manifest and icon routes', find: 'app.use(express.json());', replace: SERVER_ROUTES }],
  },
  {
    file: 'app.html',
    backup: 'app.before-install.html',
    edits: [{ name: 'install tags', find: VIEWPORT, replace: HEAD_TAGS }],
  },
  {
    file: 'login.html',
    backup: 'login.before-install.html',
    edits: [{ name: 'install tags', find: VIEWPORT, replace: HEAD_TAGS }],
  },
  {
    file: 'dashboard.html',
    backup: 'dashboard.before-install.html',
    edits: [{ name: 'install tags', find: VIEWPORT, replace: HEAD_TAGS }],
  },
  {
    file: 'chat.html',
    backup: 'chat.before-install.html',
    edits: [{ name: 'install tags', find: VIEWPORT, replace: HEAD_TAGS }],
  },
  {
    file: 'bookings.js',
    backup: 'bookings.before-install.js',
    edits: [{ name: 'install tags (My jobs page)', find: VIEWPORT, replace: HEAD_TAGS }],
  },
];

if (fs.existsSync('server.js') && read('server.js').includes('manifest.webmanifest')) {
  console.log('This is already applied. Nothing to do.');
  process.exit(0);
}

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

// ---------------------------------------------------------------------------
// 2. A tiny PNG writer (no extra libraries needed)
// ---------------------------------------------------------------------------
const CRC_TABLE = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(size, rgb) {
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // no filter
    rgb.copy(raw, y * stride + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits per colour
  ihdr[9] = 2; // plain RGB (icons must be solid, with no see-through parts)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// 3. Drawing the icon: blue-to-purple square with a white "IG"
//    Everything is full-bleed with the letters near the middle, so the same
//    picture also works when a phone crops icons into circles or rounded squares.
// ---------------------------------------------------------------------------
function inRoundRect(u, v, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(u, x0 + r), x1 - r);
  const cy = Math.min(Math.max(v, y0 + r), y1 - r);
  const dx = u - cx;
  const dy = v - cy;
  return dx * dx + dy * dy <= r * r;
}

function renderIcon(size) {
  const SS = 4; // 4x4 samples per pixel keeps the edges smooth
  const rgb = Buffer.alloc(size * size * 3);

  const t = 0.078;          // stroke thickness
  const R = 0.19;           // radius of the G (and half the height of the I)
  const gap = 0.07;         // space between the letters
  const cy = 0.5;
  const total = t + gap + 2 * R;
  const x0 = 0.5 - total / 2;
  const gx = x0 + t + gap + R;
  const barEnd = gx + Math.sqrt(R * R - (t / 2) * (t / 2));
  const DEG = Math.PI / 180;
  const OPEN_FROM = -55 * DEG; // the G is open at the upper right
  const OPEN_TO = -12 * DEG;

  function glyph(u, v) {
    // the "I"
    if (inRoundRect(u, v, x0, cy - R, x0 + t, cy + R, t / 2)) return true;
    // the "G": a ring with an opening at the upper right...
    const dx = u - gx;
    const dy = v - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= R && d >= R - t) {
      const a = Math.atan2(dy, dx);
      if (!(a > OPEN_FROM && a < OPEN_TO)) return true;
    }
    // ...plus the short bar across the middle
    return u >= gx && u <= barEnd && v >= cy - t / 2 && v <= cy + t / 2;
  }

  const c1 = [0, 113, 227];   // blue
  const c2 = [88, 86, 214];   // purple
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (px + (sx + 0.5) / SS) / size;
          const v = (py + (sy + 0.5) / SS) / size;
          if (glyph(u, v)) hits++;
        }
      }
      const cover = hits / (SS * SS);
      const mix = ((px + 0.5) / size + (py + 0.5) / size) / 2; // diagonal blend
      const o = (py * size + px) * 3;
      for (let k = 0; k < 3; k++) {
        const bg = c1[k] + (c2[k] - c1[k]) * mix;
        rgb[o + k] = Math.round(bg + (255 - bg) * cover);
      }
    }
  }
  return rgb;
}

// ---------------------------------------------------------------------------
// 4. Create the icons and the manifest
// ---------------------------------------------------------------------------
fs.mkdirSync('icons', { recursive: true });
[
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
].forEach((i) => {
  fs.writeFileSync(path.join('icons', i[0]), encodePNG(i[1], renderIcon(i[1])));
  console.log('Created icons/' + i[0]);
});

const manifest = {
  name: 'IGOwork',
  short_name: 'IGOwork',
  description: 'Find trusted artisans near you.',
  id: '/',
  start_url: '/app',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#f5f5f7',
  theme_color: '#f5f5f7',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
fs.writeFileSync('manifest.webmanifest', JSON.stringify(manifest, null, 2) + '\n');
console.log('Created manifest.webmanifest');

// ---------------------------------------------------------------------------
// 5. Patch the server and the pages (with backups)
// ---------------------------------------------------------------------------
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

console.log('IGOwork is now installable.');