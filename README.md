# IGOWork - Artisan Booking Platform

## 🎯 Project Overview

IGOWork is a comprehensive artisan booking application that connects clients with skilled service providers (plumbers, electricians, carpenters, etc.) based on proximity, experience, and pricing.

## 🏗️ Architecture

### Core Features

1. **Proximity-Based Search** - Find artisans within 3km radius using GPS coordinates
2. **Intelligent Ranking Algorithm** - Sort by experience, pricing, ratings, and job history
3. **Mutual Rating System** - Both clients and artisans rate each other after job completion

### Technology Stack

- **Backend**: Node.js or Python 3.8+
- **Database**: PostgreSQL (recommended) with PostGIS for geospatial queries
- **API**: RESTful API design
- **Authentication**: JWT tokens

---

## 📊 Data Schema

### Users Table
Stores both clients and artisans with unified authentication.

```sql
users (
    id, email, password_hash, full_name, phone,
    user_type, average_rating, total_ratings,
    is_verified, is_active, created_at
)
```

### Artisan Profiles Table
Extended profile data for service providers.

```sql
artisan_profiles (
    id, user_id, latitude, longitude, address,
    trade_category, years_of_experience,
    hourly_rate, service_fee,
    total_jobs_completed, ranking_score,
    is_available, created_at
)
```

### Bookings Table
Job requests and completion tracking.

```sql
bookings (
    id, client_id, artisan_id,
    trade_category, title, description,
    service_latitude, service_longitude,
    quoted_price, final_price, service_fee,
    status, scheduled_datetime, completed_datetime
)
```

### Ratings Table
Mutual feedback system.

```sql
ratings (
    id, booking_id, rater_id, ratee_id,
    rater_type, stars, review_text,
    professionalism_score, quality_score,
    communication_score, timeliness_score,
    value_for_money_score, created_at
)
```

---

## 🔍 Proximity Search Algorithm

### Haversine Formula Implementation

The system uses the **Haversine formula** to calculate the great-circle distance between two GPS coordinates on Earth's surface.

**Formula:**
```
a = sin²(Δlat/2) + cos(lat1) × cos(lat2) × sin²(Δlon/2)
c = 2 × atan2(√a, √(1−a))
distance = R × c
```

Where:
- R = Earth's radius (6,371 km)
- Δlat = lat2 - lat1 (in radians)
- Δlon = lon2 - lon1 (in radians)

### Code Example (Node.js)

```javascript
function calculateDistance(lat1, lon1, lat2, lon2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c; // Distance in km
}
```

---

## 🏆 IGOWork Ranking Algorithm

### Algorithm Design

The ranking algorithm positions artisans in search results based on a weighted combination of four factors:

| Factor | Weight | Purpose |
|--------|--------|---------|
| Experience | 40% | Rewards seasoned professionals |
| Service Fee | 30% | Reflects expertise through pricing |
| Rating | 20% | Customer satisfaction indicator |
| Jobs Completed | 10% | Track record validation |

### How It Works

1. **Normalization** - Each factor is normalized to a 0-1 scale
2. **Weighted Scoring** - Factors are multiplied by their weights
3. **Final Score** - Sum is scaled to 0-1000 for readability

**Result Ordering:**
- **Top**: High experience + higher service fee + excellent ratings
- **Bottom**: Entry-level + affordable pricing + fewer reviews

### Code Example (Node.js)

```javascript
function calculateRankingScore(artisan, datasetStats) {
  const normalizedExperience = normalize(
    artisan.years_of_experience,
    datasetStats.minExperience,
    datasetStats.maxExperience
  );
  
  const normalizedServiceFee = normalize(
    artisan.service_fee,
    datasetStats.minServiceFee,
    datasetStats.maxServiceFee
  );
  
  const normalizedRating = normalize(
    artisan.average_rating, 1, 5
  );
  
  const normalizedJobs = normalize(
    artisan.total_jobs_completed,
    datasetStats.minJobs,
    datasetStats.maxJobs
  );
  
  const score = 
    (normalizedExperience * 0.4) +
    (normalizedServiceFee * 0.3) +
    (normalizedRating * 0.2) +
    (normalizedJobs * 0.1);
  
  return score * 1000; // Scale to 0-1000
}
```

---

## ⭐ Mutual Rating System

### How It Works

After a job is marked as completed, both parties rate each other:

**Client → Artisan:**
- Overall stars (1-5)
- Review text
- Criteria: Professionalism, Quality, Communication, Timeliness, Value

**Artisan → Client:**
- Overall stars (1-5)
- Review text
- Criteria: Communication, Professionalism, Payment promptness

### Rating Update Formula

Average ratings are updated incrementally for efficiency:

```
new_average = (current_average × total_ratings + new_rating) / (total_ratings + 1)
```

### Code Example (Node.js)

```javascript
async function updateUserRating(userId, newRating) {
  const user = await db.users.findById(userId);
  
  const currentTotal = user.average_rating * user.total_ratings;
  const newTotal = currentTotal + newRating;
  const newCount = user.total_ratings + 1;
  const newAverage = newTotal / newCount;
  
  await db.users.update(userId, {
    average_rating: parseFloat(newAverage.toFixed(2)),
    total_ratings: newCount
  });
}
```

---

## 🚀 API Endpoints

### Search Artisans

**GET** `/api/v1/artisans/search`

**Query Parameters:**
```
latitude    (required) - User's latitude
longitude   (required) - User's longitude
radius      (optional) - Search radius in km (default: 3)
trade       (optional) - Trade category filter
min_rating  (optional) - Minimum rating filter
max_fee     (optional) - Maximum service fee filter
limit       (optional) - Results limit
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 5,
    "artisans": [
      {
        "id": "uuid",
        "full_name": "John Doe",
        "trade_category": "plumber",
        "years_of_experience": 8,
        "service_fee": 10000,
        "average_rating": 4.8,
        "distance_km": 1.2,
        "ranking_score": 856.4
      }
    ]
  }
}
```

### Submit Rating

**POST** `/api/v1/ratings`

**Body:**
```json
{
  "booking_id": "uuid",
  "stars": 5,
  "review_text": "Excellent work!",
  "professionalism_score": 5,
  "quality_score": 5,
  "communication_score": 4
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "rating_id": "uuid",
    "updated_stats": {
      "average_rating": 4.75,
      "total_ratings": 121
    }
  }
}
```

---

## 🔧 Setup & Installation

### Prerequisites

- Node.js 16+ or Python 3.8+
- PostgreSQL 13+
- PostGIS extension (for production geo-queries)

### Node.js Setup

```bash
# Install dependencies
npm install uuid

# Run examples
node igowork-examples.js
```

### Python Setup

```bash
# Install dependencies
pip install dataclasses

# Run examples
python igowork_service.py
```

### Database Setup

```bash
# Create database
createdb igowork

# Enable PostGIS (for production)
psql igowork -c "CREATE EXTENSION postgis;"

# Run schema
psql igowork < igowork-schema.sql
```

---

## 📈 Performance Optimization

### Database Indexes

Critical indexes for performance:

```sql
-- Geospatial index (requires PostGIS)
CREATE INDEX idx_artisan_location 
ON artisan_profiles USING GIST (ST_MakePoint(longitude, latitude));

-- Ranking index
CREATE INDEX idx_artisan_ranking 
ON artisan_profiles(ranking_score DESC);

-- Trade category index
CREATE INDEX idx_artisan_trade 
ON artisan_profiles(trade_category);
```

### Caching Strategy

1. **Redis** - Cache frequently searched locations
2. **CDN** - Cache artisan profile images
3. **Database** - Materialize ranking scores (update nightly)

---

## 🧪 Testing

### Sample Test Cases

**Proximity Search:**
```javascript
// Test: Should find artisans within 3km
const results = filterArtisansByProximity(
  { latitude: 9.0765, longitude: 7.3986 },
  artisans,
  3
);
assert(results.every(a => a.distance_km <= 3));
```

**Ranking Algorithm:**
```javascript
// Test: Higher experience should rank higher
const sorted = findAndRankArtisans(location, artisans);
assert(sorted[0].years_of_experience > sorted[sorted.length - 1].years_of_experience);
```

**Rating System:**
```javascript
// Test: Rating should update average correctly
const stats = await updateUserRating(userId, 5);
assert(stats.total_ratings === oldStats.total_ratings + 1);
```

---

## 🛡️ Security Considerations

1. **Input Validation** - Validate GPS coordinates and rating values
2. **Authentication** - JWT tokens for API access
3. **Rate Limiting** - Prevent abuse of search API
4. **SQL Injection** - Use parameterized queries
5. **Privacy** - Don't expose exact artisan locations until booking

---

## 📱 Mobile App Integration

### GPS Permissions

Request user location permissions:

```javascript
// React Native example
import Geolocation from '@react-native-community/geolocation';

Geolocation.getCurrentPosition(
  (position) => {
    searchArtisans({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude
    });
  }
);
```

---

## 🔄 Future Enhancements

1. **Real-time availability** - WebSocket for live status updates
2. **Smart pricing** - Dynamic pricing based on demand
3. **Route optimization** - Help artisans plan multiple jobs
4. **Skills verification** - Upload and verify certifications
5. **In-app chat** - Real-time messaging between parties
6. **Payment integration** - Stripe, Paystack integration
7. **Review moderation** - AI-powered fake review detection

---

## 📄 License

MIT License - See LICENSE file for details

---

## 👥 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📞 Support

For questions or issues:
- Email: support@igowork.com
- Documentation: https://docs.igowork.com
- GitHub Issues: https://github.com/igowork/issues

---

## 🙏 Acknowledgments

- Haversine formula implementation
- PostgreSQL PostGIS extension
- Community feedback and contributions

---

**Built with ❤️ for connecting skilled artisans with those who need them**
