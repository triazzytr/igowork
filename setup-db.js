const { DatabaseSync } = require('node:sqlite');

// This creates the file igowork.db if it doesn't exist yet
const db = new DatabaseSync('igowork.db');

// Create the tables (does nothing if they already exist)
db.exec(`
  CREATE TABLE IF NOT EXISTS artisans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    trade_category TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    years_of_experience INTEGER NOT NULL DEFAULT 0,
    service_fee REAL NOT NULL,
    average_rating REAL NOT NULL DEFAULT 0,
    total_ratings INTEGER NOT NULL DEFAULT 0,
    total_jobs_completed INTEGER NOT NULL DEFAULT 0,
    is_available INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    phone TEXT,
    average_rating REAL NOT NULL DEFAULT 0,
    total_ratings INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    artisan_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (artisan_id) REFERENCES artisans(id)
  );
`);

// Add sample data only if the artisans table is empty
const count = db.prepare('SELECT COUNT(*) AS n FROM artisans').get().n;

if (count === 0) {
  const insertArtisan = db.prepare(`
    INSERT INTO artisans
      (full_name, trade_category, latitude, longitude, years_of_experience,
       service_fee, average_rating, total_ratings, total_jobs_completed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertArtisan.run('Chukwudi Okonkwo', 'plumber', 9.0820, 7.4010, 8, 10000, 4.8, 120, 156);
  insertArtisan.run('Aisha Mohammed', 'electrician', 9.0750, 7.3990, 5, 8000, 4.6, 85, 98);
  insertArtisan.run('Fatima Bello', 'plumber', 9.0780, 7.4005, 1, 4000, 3.8, 12, 15);
  insertArtisan.run('Grace Eze', 'painter', 9.1000, 7.4200, 6, 12000, 4.7, 90, 110);

  db.prepare('INSERT INTO clients (full_name, phone) VALUES (?, ?)')
    .run('Test Client', '+234-800-000-0000');

  console.log('Sample data added.');
} else {
  console.log('Data already exists, nothing added.');
}

// Show what is stored
console.log('\nArtisans in the database:');
for (const a of db.prepare('SELECT id, full_name, trade_category FROM artisans').all()) {
  console.log(`  ${a.id}. ${a.full_name} (${a.trade_category})`);
}