/**
 * ============================================================================
 * IGOWork Service Discovery & Ranking System
 * ============================================================================
 * Core business logic for artisan discovery, ranking, and feedback loops
 * Technology: Node.js with modular, scalable architecture
 * ============================================================================
 */

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const EARTH_RADIUS_KM = 6371; // Earth's radius in kilometers
const DEFAULT_SEARCH_RADIUS_KM = 3; // Default proximity search radius
const RATING_SCALE = { MIN: 1, MAX: 5 };

// Ratings are blended with a neutral baseline so new artisans start fairly
const NEUTRAL_RATING = 3.5;   // how an artisan with no ratings is treated
const RATING_CONFIDENCE = 10; // roughly how many ratings it takes to be fully trusted

// Ranking algorithm weights
const RANKING_WEIGHTS = {
  EXPERIENCE: 0.4,      // 40% weight on years of experience
  SERVICE_FEE: 0.3,     // 30% weight on service fee
  RATING: 0.2,          // 20% weight on customer rating
  JOBS_COMPLETED: 0.1   // 10% weight on total jobs
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * 
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  // Convert degrees to radians
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;
  
  return distance;
}

/**
 * Normalize a value to a 0-1 scale for ranking calculations
 * 
 * @param {number} value - The value to normalize
 * @param {number} min - Minimum value in dataset
 * @param {number} max - Maximum value in dataset
 * @returns {number} Normalized value between 0 and 1
 */
function normalize(value, min, max) {
  if (max === min) return 0.5; // Avoid division by zero
  return (value - min) / (max - min);
}

// ============================================================================
// PROXIMITY SEARCH FUNCTION
// ============================================================================

/**
 * Filter artisans within specified radius of user's location
 * 
 * @param {Object} userLocation - User's GPS coordinates
 * @param {number} userLocation.latitude - User's latitude
 * @param {number} userLocation.longitude - User's longitude
 * @param {Array} artisans - Array of artisan objects with location data
 * @param {number} radiusKm - Search radius in kilometers (default: 3km)
 * @returns {Array} Filtered artisans with distance property added
 */
function filterArtisansByProximity(userLocation, artisans, radiusKm = DEFAULT_SEARCH_RADIUS_KM) {
  // Validate input
  if (!userLocation || typeof userLocation.latitude !== 'number' || typeof userLocation.longitude !== 'number') {
    throw new Error('Invalid user location coordinates');
  }
  
  if (!Array.isArray(artisans)) {
    throw new Error('Artisans must be an array');
  }
  
  // Filter and calculate distances
  const artisansWithDistance = artisans
    .map(artisan => {
      // Validate artisan has location data
      if (!artisan.latitude || !artisan.longitude) {
        console.warn(`Artisan ${artisan.id} missing location data`);
        return null;
      }
      
      // Calculate distance from user
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        artisan.latitude,
        artisan.longitude
      );
      
      // Return artisan with distance property
      return {
        ...artisan,
        distance_km: parseFloat(distance.toFixed(2))
      };
    })
    .filter(artisan => artisan !== null) // Remove artisans with missing data
    .filter(artisan => artisan.distance_km <= radiusKm); // Filter by radius
  
  return artisansWithDistance;
}

// ============================================================================
// IGOWORK RANKING ALGORITHM
// ============================================================================

/**
 * Calculate IGOWork ranking score for an artisan
 * Formula combines: experience, service fee, rating, and jobs completed
 * 
 * Higher score = appears higher in results
 * Top: High experience + higher service fee + good ratings
 * Bottom: Low experience + lower service fee
 * 
 * @param {Object} artisan - Artisan object with required fields
 * @param {Object} datasetStats - Min/max values for normalization
 * @returns {number} Calculated ranking score
 */
function calculateRankingScore(artisan, datasetStats) {
  const {
    years_of_experience = 0,
    service_fee = 0,
    average_rating = 0,
    total_ratings = 0,
    total_jobs_completed = 0
  } = artisan;
  
  // Normalize each factor to 0-1 scale
  const normalizedExperience = normalize(
    years_of_experience,
    datasetStats.minExperience,
    datasetStats.maxExperience
  );
  
  const normalizedServiceFee = normalize(
    service_fee,
    datasetStats.minServiceFee,
    datasetStats.maxServiceFee
  );
  
  // Blend the average with a neutral baseline: few ratings count for
  // little, many ratings count for a lot.
  const adjustedRating =
    (average_rating * total_ratings + NEUTRAL_RATING * RATING_CONFIDENCE) /
    (total_ratings + RATING_CONFIDENCE);

  const normalizedRating = normalize(
    adjustedRating,
    RATING_SCALE.MIN,
    RATING_SCALE.MAX
  );
  
  const normalizedJobs = normalize(
    total_jobs_completed,
    datasetStats.minJobs,
    datasetStats.maxJobs
  );
  
  // Calculate weighted score
  const rankingScore = 
    (normalizedExperience * RANKING_WEIGHTS.EXPERIENCE) +
    (normalizedServiceFee * RANKING_WEIGHTS.SERVICE_FEE) +
    (normalizedRating * RANKING_WEIGHTS.RATING) +
    (normalizedJobs * RANKING_WEIGHTS.JOBS_COMPLETED);
  
  // Scale to 0-1000 for easier interpretation
  return parseFloat((rankingScore * 1000).toFixed(2));
}

/**
 * Get dataset statistics for normalization
 * 
 * @param {Array} artisans - Array of artisan objects
 * @returns {Object} Min/max statistics
 */
function getDatasetStats(artisans) {
  if (!artisans || artisans.length === 0) {
    return {
      minExperience: 0,
      maxExperience: 1,
      minServiceFee: 0,
      maxServiceFee: 1,
      minJobs: 0,
      maxJobs: 1
    };
  }
  
  const experiences = artisans.map(a => a.years_of_experience || 0);
  const serviceFees = artisans.map(a => a.service_fee || 0);
  const jobs = artisans.map(a => a.total_jobs_completed || 0);
  
  return {
    minExperience: Math.min(...experiences),
    maxExperience: Math.max(...experiences),
    minServiceFee: Math.min(...serviceFees),
    maxServiceFee: Math.max(...serviceFees),
    minJobs: Math.min(...jobs),
    maxJobs: Math.max(...jobs)
  };
}

/**
 * Main function: Find and rank artisans near user
 * 
 * @param {Object} userLocation - User's GPS coordinates
 * @param {Array} artisans - All available artisans
 * @param {Object} options - Search options
 * @returns {Array} Sorted, ranked artisans within proximity
 */
function findAndRankArtisans(userLocation, artisans, options = {}) {
  const {
    radiusKm = DEFAULT_SEARCH_RADIUS_KM,
    tradeCategory = null,
    minRating = null,
    maxServiceFee = null,
    limit = null
  } = options;
  
  // Step 1: Filter by proximity
  let nearbyArtisans = filterArtisansByProximity(userLocation, artisans, radiusKm);
  
  // Step 2: Apply additional filters
  if (tradeCategory) {
    nearbyArtisans = nearbyArtisans.filter(
      a => a.trade_category.toLowerCase() === tradeCategory.toLowerCase()
    );
  }
  
  if (minRating) {
    nearbyArtisans = nearbyArtisans.filter(a => a.average_rating >= minRating);
  }
  
  if (maxServiceFee) {
    nearbyArtisans = nearbyArtisans.filter(a => a.service_fee <= maxServiceFee);
  }
  
  // Filter only available artisans
  nearbyArtisans = nearbyArtisans.filter(a => a.is_available !== false);
  
  // Step 3: Calculate ranking scores
  const datasetStats = getDatasetStats(nearbyArtisans);
  
  const rankedArtisans = nearbyArtisans.map(artisan => ({
    ...artisan,
    ranking_score: calculateRankingScore(artisan, datasetStats)
  }));
  
  // Step 4: Sort by ranking score (highest first)
  rankedArtisans.sort((a, b) => b.ranking_score - a.ranking_score);
  
  // Step 5: Apply limit if specified
  if (limit && limit > 0) {
    return rankedArtisans.slice(0, limit);
  }
  
  return rankedArtisans;
}

// ============================================================================
// MUTUAL RATING SYSTEM
// ============================================================================

/**
 * Submit a rating for a completed booking
 * 
 * @param {Object} ratingData - Rating submission data
 * @returns {Object} Created rating object
 */
async function submitRating(ratingData) {
  const {
    bookingId,
    raterId,
    rateeId,
    raterType,
    stars,
    reviewText = '',
    criteriaScores = {}
  } = ratingData;
  
  // Validate rating
  if (!stars || stars < RATING_SCALE.MIN || stars > RATING_SCALE.MAX) {
    throw new Error(`Rating must be between ${RATING_SCALE.MIN} and ${RATING_SCALE.MAX} stars`);
  }
  
  if (!bookingId || !raterId || !rateeId) {
    throw new Error('Missing required rating fields');
  }
  
  // Create rating object
  const rating = {
    id: generateUUID(), // Use your UUID generator
    booking_id: bookingId,
    rater_id: raterId,
    ratee_id: rateeId,
    rater_type: raterType,
    stars: stars,
    review_text: reviewText,
    professionalism_score: criteriaScores.professionalism || null,
    quality_score: criteriaScores.quality || null,
    communication_score: criteriaScores.communication || null,
    timeliness_score: criteriaScores.timeliness || null,
    value_for_money_score: criteriaScores.valueForMoney || null,
    is_visible: true,
    created_at: new Date().toISOString()
  };
  
  // In production, save to database here
  // await db.ratings.create(rating);
  
  return rating;
}

/**
 * Update user's average rating after receiving a new rating
 * This function should be called after a rating is submitted
 * 
 * @param {string} userId - ID of user whose rating is being updated
 * @param {number} newRating - New rating received (1-5)
 * @returns {Object} Updated rating statistics
 */
async function updateUserRating(userId, newRating) {
  // In production, fetch current user data from database
  // const user = await db.users.findById(userId);
  
  // Mock user data for demonstration
  let user = {
    id: userId,
    average_rating: 0,
    total_ratings: 0
  };
  
  // Calculate new average using incremental formula
  // This is more efficient than recalculating from all ratings
  const currentTotal = user.average_rating * user.total_ratings;
  const newTotal = currentTotal + newRating;
  const newCount = user.total_ratings + 1;
  const newAverage = newTotal / newCount;
  
  const updatedStats = {
    average_rating: parseFloat(newAverage.toFixed(2)),
    total_ratings: newCount
  };
  
  // In production, update database
  // await db.users.update(userId, updatedStats);
  
  return updatedStats;
}

/**
 * Process mutual ratings after job completion
 * Both client and artisan rate each other
 * 
 * @param {Object} jobData - Completed job data
 * @param {Object} clientRating - Client's rating of artisan
 * @param {Object} artisanRating - Artisan's rating of client
 * @returns {Object} Results of rating process
 */
async function processMutualRatings(jobData, clientRating, artisanRating) {
  const { bookingId, clientId, artisanId } = jobData;
  
  try {
    // Submit both ratings
    const clientRatingRecord = await submitRating({
      bookingId,
      raterId: clientId,
      rateeId: artisanId,
      raterType: 'client',
      ...clientRating
    });
    
    const artisanRatingRecord = await submitRating({
      bookingId,
      raterId: artisanId,
      rateeId: clientId,
      raterType: 'artisan',
      ...artisanRating
    });
    
    // Update both users' average ratings
    const artisanNewStats = await updateUserRating(artisanId, clientRating.stars);
    const clientNewStats = await updateUserRating(clientId, artisanRating.stars);
    
    // For artisans, also update ranking score
    // This should trigger a recalculation of their position in search results
    if (artisanNewStats) {
      // In production, update artisan_profiles.ranking_score
      // await recalculateArtisanRanking(artisanId);
    }
    
    return {
      success: true,
      clientRating: clientRatingRecord,
      artisanRating: artisanRatingRecord,
      updatedStats: {
        artisan: artisanNewStats,
        client: clientNewStats
      }
    };
  } catch (error) {
    console.error('Error processing mutual ratings:', error);
    throw error;
  }
}

/**
 * Get all ratings for a specific user
 * 
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Array} User's ratings
 */
async function getUserRatings(userId, options = {}) {
  const { limit = 10, offset = 0, sortBy = 'created_at' } = options;
  
  // In production, fetch from database
  // const ratings = await db.ratings.find({
  //   ratee_id: userId,
  //   is_visible: true
  // }).sort(sortBy).limit(limit).offset(offset);
  
  // Mock return
  return [];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a simple UUID (use a proper library like 'uuid' in production)
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Validate GPS coordinates
 */
function isValidCoordinates(lat, lon) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Proximity search
  filterArtisansByProximity,
  calculateDistance,
  
  // Ranking algorithm
  findAndRankArtisans,
  calculateRankingScore,
  getDatasetStats,
  
  // Rating system
  submitRating,
  updateUserRating,
  processMutualRatings,
  getUserRatings,
  
  // Utilities
  normalize,
  generateUUID,
  isValidCoordinates,
  
  // Constants
  EARTH_RADIUS_KM,
  DEFAULT_SEARCH_RADIUS_KM,
  RATING_SCALE,
  RANKING_WEIGHTS
};
