const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { findAndRankArtisans, isValidCoordinates } = require('./igowork-service');

const app = express();
app.set('trust proxy', 1);
// Hosting providers assign their own port; 3000 is only the fallback for your computer
const PORT = process.env.PORT || 3000;
const db = new DatabaseSync('igowork.db');
require('./db-init')(db);

app.use(express.json());

// Work out who is logged in before any route runs
app.use(require('./auth')(db));

app.get('/', (req, res) => {
  res.send('IGOwork server is running.');
});

app.get('/add', (req, res) => res.redirect('/login'));

app.get('/app', (req, res) => {
  // Artisans use their own dashboard, not the client search screen
  if (req.account && req.account.role === 'artisan') return res.redirect('/dashboard');
  res.sendFile(__dirname + '/app.html');
});

// List every artisan stored in the database
app.get('/api/artisans', (req, res) => {
  if (req.account && req.account.role === 'artisan') {
    return res.status(403).json({ error: 'Artisan accounts cannot browse other artisans.' });
  }
  const artisans = db.prepare(`
    SELECT id, full_name, trade_category, years_of_experience, service_fee,
           average_rating, total_ratings, total_jobs_completed, is_available
    FROM artisans
  `).all();
  res.json({ count: artisans.length, artisans });
});

// Search nearby artisans, ranked by the IGOwork algorithm
app.get('/api/search', (req, res) => {
  if (req.account && req.account.role === 'artisan') {
    return res.status(403).json({ error: 'Artisan accounts cannot browse other artisans.' });
  }

  const latitude = parseFloat(req.query.lat);
  const longitude = parseFloat(req.query.lng);

  if (!isValidCoordinates(latitude, longitude)) {
    return res.status(400).json({
      error: 'Provide lat and lng, e.g. /api/search?lat=9.0765&lng=7.3986',
    });
  }

  const artisans = db.prepare('SELECT * FROM artisans WHERE is_available = 1').all();

  const results = findAndRankArtisans({ latitude, longitude }, artisans, {
    tradeCategory: req.query.trade || null,
    radiusKm: req.query.radius ? parseFloat(req.query.radius) : 3,
  });

  res.json({ count: results.length, artisans: results });
});

app.use(require('./notifications')(db));
app.use(require('./push')(db));
app.use(require('./dashboard')(db));
app.use(require('./bookings')(db));
app.use(require('./ratings')(db));
app.use(require('./chat')(db));

app.listen(PORT, () => {
  console.log('IGOwork running at http://localhost:' + PORT);
});