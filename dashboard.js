const express = require('express');
const path = require('path');

// The artisan-only dashboard.
module.exports = function (db) {
  const router = express.Router();

  // Artisans only: logged-out visitors go to login, clients go to the search screen
  router.get('/dashboard', (req, res) => {
    if (!req.account) return res.redirect('/login');
    if (req.account.role !== 'artisan') return res.redirect('/app');
    res.sendFile(path.join(__dirname, 'dashboard.html'));
  });

  // Artisans use the dashboard instead of the old jobs page
  router.get('/bookings', (req, res, next) => {
    if (req.account && req.account.role === 'artisan') return res.redirect('/dashboard');
    next();
  });

  // The artisan's own account details (and nobody else's)
  router.get('/api/my-profile', (req, res) => {
    if (!req.account) {
      return res.status(401).json({ error: 'Please log in first.' });
    }
    if (req.account.role !== 'artisan') {
      return res.status(403).json({ error: 'Artisan accounts only.' });
    }

    const p = db.prepare(`
      SELECT trade_category, years_of_experience, service_fee,
             average_rating, total_ratings, total_jobs_completed
      FROM artisans WHERE account_id = ?
    `).get(req.account.id);

    if (!p) {
      return res.status(404).json({ error: 'Artisan profile not found.' });
    }

    res.json({
      profile: Object.assign({ full_name: req.account.full_name, email: req.account.email }, p),
    });
  });

  return router;
};