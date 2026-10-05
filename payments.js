const express = require('express');
const crypto = require('crypto');

// The booking fee in Naira. A placeholder value for testing only.
const BOOKING_FEE = 500;

// Booking fee payments.
// TEST MODE: no real money moves. "Pay" just records a test payment.
module.exports = function (db) {
  const router = express.Router();

  // One payment per booking: UNIQUE (booking_id) stops double charging
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL UNIQUE,
      amount REAL NOT NULL,
      provider TEXT NOT NULL,
      reference TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `);

  // The client pays the booking fee once the artisan has accepted
  router.post('/api/bookings/:id/pay', (req, res) => {
    if (!req.account) {
      return res.status(401).json({ error: 'Please log in first.' });
    }
    if (req.account.role !== 'client') {
      return res.status(403).json({ error: 'Only the client pays the booking fee.' });
    }

    const client = db.prepare('SELECT id FROM clients WHERE account_id = ?').get(req.account.id);
    const id = parseInt(req.params.id, 10);
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);

    // Same message whether it doesn't exist or isn't yours
    if (!booking || !client || booking.client_id !== client.id) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    if (booking.status !== 'accepted') {
      return res.status(400).json({ error: 'You can pay once the artisan has accepted the request.' });
    }
    if (db.prepare('SELECT id FROM payments WHERE booking_id = ?').get(id)) {
      return res.status(400).json({ error: 'The booking fee has already been paid.' });
    }

    // TEST MODE: a real provider (Paystack, Flutterwave) would be called here,
    // and the payment confirmed by the provider before anything is saved.
    db.prepare(
      'INSERT INTO payments (booking_id, amount, provider, reference) VALUES (?, ?, ?, ?)'
    ).run(id, BOOKING_FEE, 'test', 'TEST-' + crypto.randomBytes(6).toString('hex'));

    res.status(201).json({
      message: 'Test payment recorded (no real money was taken). Contact details are now unlocked.',
    });
  });

  return router;
};

// Lets other files read the fee: require('./payments').BOOKING_FEE
module.exports.BOOKING_FEE = BOOKING_FEE;