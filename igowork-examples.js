/**
 * ============================================================================
 * IGOWork Service - Example Usage & Test Cases
 * ============================================================================
 * Demonstrates how to use the core service functions
 * ============================================================================
 */

const {
  findAndRankArtisans,
  processMutualRatings,
  calculateDistance
} = require('./igowork-service');

// ============================================================================
// SAMPLE DATA
// ============================================================================

// Sample user location (Abuja, Nigeria - Central Business District)
const userLocation = {
  latitude: 9.0765,
  longitude: 7.3986
};

// Sample artisan data (various locations around Abuja)
const sampleArtisans = [
  {
    id: 'a1',
    user_id: 'u1',
    full_name: 'Chukwudi Okonkwo',
    trade_category: 'plumber',
    latitude: 9.0820,  // ~0.7km from user
    longitude: 7.4010,
    years_of_experience: 8,
    service_fee: 10000,
    hourly_rate: 5000,
    average_rating: 4.8,
    total_ratings: 120,
    total_jobs_completed: 156,
    is_available: true,
    phone: '+234-800-111-1111',
    bio: 'Expert plumber with 8 years experience. Licensed and insured.'
  },
  {
    id: 'a2',
    user_id: 'u2',
    full_name: 'Aisha Mohammed',
    trade_category: 'electrician',
    latitude: 9.0750,  // ~0.3km from user
    longitude: 7.3990,
    years_of_experience: 5,
    service_fee: 8000,
    hourly_rate: 4000,
    average_rating: 4.6,
    total_ratings: 85,
    total_jobs_completed: 98,
    is_available: true,
    phone: '+234-800-222-2222',
    bio: 'Certified electrician specializing in residential and commercial wiring.'
  },
  {
    id: 'a3',
    user_id: 'u3',
    full_name: 'Emmanuel Adebayo',
    trade_category: 'carpenter',
    latitude: 9.0700,  // ~0.9km from user
    longitude: 7.3950,
    years_of_experience: 12,
    service_fee: 15000,
    hourly_rate: 7000,
    average_rating: 4.9,
    total_ratings: 200,
    total_jobs_completed: 245,
    is_available: true,
    phone: '+234-800-333-3333',
    bio: 'Master carpenter with over a decade of experience in custom furniture and installations.'
  },
  {
    id: 'a4',
    user_id: 'u4',
    full_name: 'Ngozi Okafor',
    trade_category: 'plumber',
    latitude: 9.0800,  // ~0.5km from user
    longitude: 7.4000,
    years_of_experience: 2,
    service_fee: 5000,
    hourly_rate: 2500,
    average_rating: 4.2,
    total_ratings: 25,
    total_jobs_completed: 30,
    is_available: true,
    phone: '+234-800-444-4444',
    bio: 'New to the trade but eager to learn and provide quality service at affordable rates.'
  },
  {
    id: 'a5',
    user_id: 'u5',
    full_name: 'Ibrahim Yusuf',
    trade_category: 'electrician',
    latitude: 9.0650,  // ~1.5km from user
    longitude: 7.3900,
    years_of_experience: 15,
    service_fee: 20000,
    hourly_rate: 10000,
    average_rating: 5.0,
    total_ratings: 300,
    total_jobs_completed: 400,
    is_available: true,
    phone: '+234-800-555-5555',
    bio: 'Premium electrician with 15 years experience. Available for complex commercial projects.'
  },
  {
    id: 'a6',
    user_id: 'u6',
    full_name: 'Grace Eze',
    trade_category: 'painter',
    latitude: 9.1000,  // ~3.5km from user (outside 3km radius)
    longitude: 7.4200,
    years_of_experience: 6,
    service_fee: 12000,
    hourly_rate: 5500,
    average_rating: 4.7,
    total_ratings: 90,
    total_jobs_completed: 110,
    is_available: true,
    phone: '+234-800-666-6666',
    bio: 'Professional painter specializing in interior and exterior work.'
  },
  {
    id: 'a7',
    user_id: 'u7',
    full_name: 'Fatima Bello',
    trade_category: 'plumber',
    latitude: 9.0780,
    longitude: 7.4005,
    years_of_experience: 1,
    service_fee: 4000,
    hourly_rate: 2000,
    average_rating: 3.8,
    total_ratings: 12,
    total_jobs_completed: 15,
    is_available: true,
    phone: '+234-800-777-7777',
    bio: 'Entry-level plumber offering budget-friendly services for basic repairs.'
  }
];

// ============================================================================
// EXAMPLE 1: Basic Proximity Search & Ranking
// ============================================================================

console.log('='.repeat(80));
console.log('EXAMPLE 1: Find All Artisans Within 3km');
console.log('='.repeat(80));

const nearbyArtisans = findAndRankArtisans(userLocation, sampleArtisans);

console.log(`\nFound ${nearbyArtisans.length} artisans within 3km radius:\n`);

nearbyArtisans.forEach((artisan, index) => {
  console.log(`${index + 1}. ${artisan.full_name} (${artisan.trade_category})`);
  console.log(`   Distance: ${artisan.distance_km}km`);
  console.log(`   Experience: ${artisan.years_of_experience} years`);
  console.log(`   Service Fee: ₦${artisan.service_fee.toLocaleString()}`);
  console.log(`   Rating: ${artisan.average_rating}⭐ (${artisan.total_ratings} reviews)`);
  console.log(`   Ranking Score: ${artisan.ranking_score}/1000`);
  console.log(`   Jobs Completed: ${artisan.total_jobs_completed}`);
  console.log('');
});

// ============================================================================
// EXAMPLE 2: Filter by Trade Category (Plumbers Only)
// ============================================================================

console.log('='.repeat(80));
console.log('EXAMPLE 2: Find Plumbers Within 3km');
console.log('='.repeat(80));

const plumbers = findAndRankArtisans(userLocation, sampleArtisans, {
  tradeCategory: 'plumber'
});

console.log(`\nFound ${plumbers.length} plumbers within 3km:\n`);

plumbers.forEach((plumber, index) => {
  console.log(`${index + 1}. ${plumber.full_name}`);
  console.log(`   ${plumber.years_of_experience} yrs exp | ₦${plumber.service_fee} fee | ${plumber.average_rating}⭐ | Rank: ${plumber.ranking_score}`);
  console.log('');
});

// ============================================================================
// EXAMPLE 3: Filter with Multiple Criteria
// ============================================================================

console.log('='.repeat(80));
console.log('EXAMPLE 3: Find Electricians (Min 4.5 Rating, Max ₦10,000 Fee)');
console.log('='.repeat(80));

const premiumElectricians = findAndRankArtisans(userLocation, sampleArtisans, {
  tradeCategory: 'electrician',
  minRating: 4.5,
  maxServiceFee: 10000,
  limit: 5
});

console.log(`\nFound ${premiumElectricians.length} matching electricians:\n`);

premiumElectricians.forEach((electrician, index) => {
  console.log(`${index + 1}. ${electrician.full_name}`);
  console.log(`   ${electrician.years_of_experience} yrs | ₦${electrician.service_fee} | ${electrician.average_rating}⭐`);
  console.log(`   Distance: ${electrician.distance_km}km | Ranking: ${electrician.ranking_score}/1000`);
  console.log('');
});

// ============================================================================
// EXAMPLE 4: Demonstrate Ranking Order
// ============================================================================

console.log('='.repeat(80));
console.log('EXAMPLE 4: Ranking Order Explanation (All Plumbers)');
console.log('='.repeat(80));
console.log('\nNotice how ranking works:');
console.log('- TOP: High experience + higher service fee + good ratings');
console.log('- BOTTOM: Entry-level + affordable pricing + fewer ratings\n');

console.log('Plumbers sorted by IGOWork algorithm:\n');

plumbers.forEach((plumber, index) => {
  const position = index === 0 ? 'TOP' : index === plumbers.length - 1 ? 'BOTTOM' : 'MIDDLE';
  console.log(`[${position}] ${plumber.full_name}`);
  console.log(`  • Experience: ${plumber.years_of_experience} years (${plumber.years_of_experience >= 5 ? 'Senior' : 'Entry-level'})`);
  console.log(`  • Service Fee: ₦${plumber.service_fee.toLocaleString()} (${plumber.service_fee >= 8000 ? 'Premium' : 'Budget'})`);
  console.log(`  • Rating: ${plumber.average_rating}⭐ from ${plumber.total_ratings} reviews`);
  console.log(`  • Completed Jobs: ${plumber.total_jobs_completed}`);
  console.log(`  • RANKING SCORE: ${plumber.ranking_score}/1000`);
  console.log('');
});

// ============================================================================
// EXAMPLE 5: Distance Calculation
// ============================================================================

console.log('='.repeat(80));
console.log('EXAMPLE 5: Distance Calculations');
console.log('='.repeat(80));

console.log(`\nUser location: ${userLocation.latitude}, ${userLocation.longitude}\n`);

sampleArtisans.slice(0, 5).forEach(artisan => {
  const distance = calculateDistance(
    userLocation.latitude,
    userLocation.longitude,
    artisan.latitude,
    artisan.longitude
  );
  
  console.log(`${artisan.full_name}:`);
  console.log(`  Location: ${artisan.latitude}, ${artisan.longitude}`);
  console.log(`  Distance: ${distance.toFixed(2)}km ${distance <= 3 ? '✓ Within range' : '✗ Out of range'}`);
  console.log('');
});

// ============================================================================
// EXAMPLE 6: Mutual Rating System
// ============================================================================

console.log('='.repeat(80));
console.log('EXAMPLE 6: Mutual Rating System (After Job Completion)');
console.log('='.repeat(80));

async function demonstrateMutualRatings() {
  const completedJob = {
    bookingId: 'booking-123',
    clientId: 'client-456',
    artisanId: 'artisan-789'
  };
  
  // Client rates artisan
  const clientRatingData = {
    stars: 5,
    reviewText: 'Excellent work! Very professional and completed the job on time.',
    criteriaScores: {
      professionalism: 5,
      quality: 5,
      communication: 5,
      timeliness: 4,
      valueForMoney: 5
    }
  };
  
  // Artisan rates client
  const artisanRatingData = {
    stars: 5,
    reviewText: 'Great client! Clear communication and prompt payment.',
    criteriaScores: {
      communication: 5,
      professionalism: 5
    }
  };
  
  console.log('\nJob Completed - Processing Mutual Ratings:\n');
  console.log('CLIENT → ARTISAN:');
  console.log(`  Stars: ${clientRatingData.stars}/5`);
  console.log(`  Review: "${clientRatingData.reviewText}"`);
  console.log(`  Criteria Breakdown:`);
  console.log(`    - Professionalism: ${clientRatingData.criteriaScores.professionalism}/5`);
  console.log(`    - Quality: ${clientRatingData.criteriaScores.quality}/5`);
  console.log(`    - Communication: ${clientRatingData.criteriaScores.communication}/5`);
  console.log(`    - Timeliness: ${clientRatingData.criteriaScores.timeliness}/5`);
  console.log(`    - Value for Money: ${clientRatingData.criteriaScores.valueForMoney}/5`);
  
  console.log('\nARTISAN → CLIENT:');
  console.log(`  Stars: ${artisanRatingData.stars}/5`);
  console.log(`  Review: "${artisanRatingData.reviewText}"`);
  
  try {
    const result = await processMutualRatings(
      completedJob,
      clientRatingData,
      artisanRatingData
    );
    
    console.log('\n✓ Ratings successfully processed!');
    console.log('\nUpdated Statistics:');
    console.log(`  Artisan: ${result.updatedStats.artisan.average_rating}/5.00 (${result.updatedStats.artisan.total_ratings} total ratings)`);
    console.log(`  Client: ${result.updatedStats.client.average_rating}/5.00 (${result.updatedStats.client.total_ratings} total ratings)`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

demonstrateMutualRatings();

// ============================================================================
// EXAMPLE 7: Performance Comparison
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('EXAMPLE 7: Performance Comparison');
console.log('='.repeat(80));

console.log('\nRanking Algorithm Weights:');
console.log('  • Experience: 40%');
console.log('  • Service Fee: 30%');
console.log('  • Rating: 20%');
console.log('  • Jobs Completed: 10%');

console.log('\nComparing two artisans:\n');

const artisan1 = plumbers.find(a => a.full_name === 'Chukwudi Okonkwo');
const artisan2 = plumbers.find(a => a.full_name === 'Fatima Bello');

if (artisan1 && artisan2) {
  console.log('HIGH RANKED:');
  console.log(`  ${artisan1.full_name}`);
  console.log(`  Experience: ${artisan1.years_of_experience} years | Fee: ₦${artisan1.service_fee}`);
  console.log(`  Rating: ${artisan1.average_rating}⭐ | Jobs: ${artisan1.total_jobs_completed}`);
  console.log(`  SCORE: ${artisan1.ranking_score}/1000`);
  
  console.log('\nLOW RANKED:');
  console.log(`  ${artisan2.full_name}`);
  console.log(`  Experience: ${artisan2.years_of_experience} years | Fee: ₦${artisan2.service_fee}`);
  console.log(`  Rating: ${artisan2.average_rating}⭐ | Jobs: ${artisan2.total_jobs_completed}`);
  console.log(`  SCORE: ${artisan2.ranking_score}/1000`);
  
  console.log('\nWhy the difference?');
  console.log(`  • ${artisan1.full_name} has ${artisan1.years_of_experience - artisan2.years_of_experience}x more experience`);
  console.log(`  • Charges ${((artisan1.service_fee / artisan2.service_fee) - 1) * 100}% more (reflects expertise)`);
  console.log(`  • Has ${artisan1.total_jobs_completed - artisan2.total_jobs_completed} more completed jobs`);
  console.log(`  • Higher average rating (${artisan1.average_rating} vs ${artisan2.average_rating})`);
}

// ============================================================================
// EXAMPLE 8: API Response Format
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('EXAMPLE 8: Sample API Response Format');
console.log('='.repeat(80));

const apiResponse = {
  success: true,
  data: {
    query: {
      location: userLocation,
      radius_km: 3,
      filters: {
        trade_category: 'plumber'
      }
    },
    results: {
      total: plumbers.length,
      artisans: plumbers.slice(0, 2).map(a => ({
        id: a.id,
        user_id: a.user_id,
        full_name: a.full_name,
        trade_category: a.trade_category,
        years_of_experience: a.years_of_experience,
        service_fee: a.service_fee,
        hourly_rate: a.hourly_rate,
        average_rating: a.average_rating,
        total_ratings: a.total_ratings,
        total_jobs_completed: a.total_jobs_completed,
        distance_km: a.distance_km,
        ranking_score: a.ranking_score,
        is_available: a.is_available,
        bio: a.bio
      }))
    }
  },
  timestamp: new Date().toISOString()
};

console.log('\nJSON Response:\n');
console.log(JSON.stringify(apiResponse, null, 2));

console.log('\n' + '='.repeat(80));
console.log('Examples Complete!');
console.log('='.repeat(80));
