const express = require('express');

// Mutual ratings. The server works out which side of the job you are on.
module.exports = function (db) {
  const router = express.Router();

  // Each side can rate a job only once: UNIQUE (booking_id, rater_type)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      rater_type TEXT NOT NULL,
      stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
      review TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (booking_id, rater_type),
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `);

  // Add one new rating to a running average (used for artisans and clients)
  function addRating(table, id, stars) {
    const row = db
      .prepare('SELECT average_rating, total_ratings FROM ' + table + ' WHERE id = ?')
      .get(id);
    const count = row.total_ratings + 1;
    const average = Math.round(((row.average_rating * row.total_ratings + stars) / count) * 100) / 100;
    db.prepare('UPDATE ' + table + ' SET average_rating = ?, total_ratings = ? WHERE id = ?')
      .run(average, count, id);
  }

  // The old ratings page now lives inside "My jobs"
  router.get('/ratings', (req, res) => {
    res.redirect('/bookings');
  });

  // Submit a rating. Body: { stars: 1-5 }
  router.post('/api/bookings/:id/rate', (req, res) => {
    if (!req.account) {
      return res.status(401).json({ error: 'Please log in first.' });
    }

    const id = parseInt(req.params.id, 10);
    const stars = parseInt((req.body || {}).stars, 10);

    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ error: 'Stars must be a whole number from 1 to 5.' });
    }

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);

    // Which side of this job is the logged-in person on?
    let rater = null;
    if (booking) {
      if (req.account.role === 'client') {
        const c = db.prepare('SELECT id FROM clients WHERE account_id = ?').get(req.account.id);
        if (c && booking.client_id === c.id) rater = 'client';
      } else {
        const a = db.prepare('SELECT id FROM artisans WHERE account_id = ?').get(req.account.id);
        if (a && booking.artisan_id === a.id) rater = 'artisan';
      }
    }

    // Same message whether it doesn't exist or isn't yours
    if (!booking || !rater) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    if (booking.status !== 'completed') {
      return res.status(400).json({ error: 'You can only rate a completed job.' });
    }

    const already = db
      .prepare('SELECT id FROM ratings WHERE booking_id = ? AND rater_type = ?')
      .get(id, rater);
    if (already) {
      return res.status(400).json({ error: 'You have already rated this job.' });
    }

    // Save the rating and update the average together, or not at all
    try {
      db.exec('BEGIN');
      db.prepare('INSERT INTO ratings (booking_id, rater_type, stars) VALUES (?, ?, ?)')
        .run(id, rater, stars);

      if (rater === 'client') {
        addRating('artisans', booking.artisan_id, stars);
      } else {
        addRating('clients', booking.client_id, stars);
      }
      db.exec('COMMIT');

      res.status(201).json({ message: 'Rating saved. Thank you!' });
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (ignore) {}
      res.status(500).json({ error: 'Could not save the rating.' });
    }
  });

  return router;
};