const fs = require('fs');

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

// The "Message" link added to job cards (same text for client and artisan pages)
const LINK = [
  "if (b.status === 'accepted' || b.status === 'completed') {",
  "    html += '<div class=\"note\"><a href=\"/chat/' + b.id + '\" style=\"color:var(--accent);font-weight:600;text-decoration:none\">' + (b.status === 'accepted' ? 'Message' : 'View messages') + '</a></div>';",
  '  }',
  "  return html + '</div>';",
].join('\n');

const jobs = [
  {
    file: 'server.js',
    backup: 'server.before-chat.js',
    edits: [
      {
        name: 'connect the chat',
        find: "app.use(require('./ratings')(db));",
        replace: "app.use(require('./ratings')(db));\napp.use(require('./chat')(db));",
      },
    ],
  },
  {
    file: 'bookings.js',
    backup: 'bookings.before-chat.js',
    edits: [
      {
        name: 'message link on the client jobs page',
        find: "return html + '</div>';",
        replace: LINK,
      },
    ],
  },
  {
    file: 'dashboard.html',
    backup: 'dashboard.before-chat.html',
    edits: [
      {
        name: 'message link on the artisan dashboard',
        find: "return html + '</div>';",
        replace: LINK,
      },
    ],
  },
  {
    file: 'app.html',
    backup: 'app.before-chat.html',
    edits: [
      {
        name: 'friendlier "no results" message',
        find: `$('results').innerHTML = '<div class="empty">No artisans found here.<br>Try a wider distance, or tap "Demo location".</div>';`,
        replace: [
          "var next = ['3', '10', '25', '50'].filter(function (v) { return Number(v) > Number($('radius').value); })[0];",
          "    $('results').innerHTML = '<div class=\"empty\">No artisans found within ' + $('radius').value + ' km.' +",
          "      (next ? '<br><br><button class=\"btn\" id=\"widen\">Search within ' + next + ' km</button>' : '<br>Try a different trade, or tap \"Demo location\".') + '</div>';",
          '    if (next) {',
          "      $('widen').onclick = function () { $('radius').value = next; search(); };",
          '    }',
        ].join('\n'),
      },
    ],
  },
];

if (read('server.js').includes("require('./chat')")) {
  console.log('This is already applied. Nothing to do.');
  process.exit(0);
}

['chat.js', 'chat.html'].forEach((f) => {
  if (!fs.existsSync(f)) {
    console.log('Missing file: ' + f + '. Create it first (steps 2 and 3), then run this again.');
    process.exit(1);
  }
});

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

console.log('Chat added.');