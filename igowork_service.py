"""
============================================================================
IGOWork Service Discovery & Ranking System - Python Implementation
============================================================================
Core business logic for artisan discovery, ranking, and feedback loops
Technology: Python 3.8+ with type hints
============================================================================
"""

import math
from typing import List, Dict, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass, field
import uuid

# ============================================================================
# CONSTANTS & CONFIGURATION
# ============================================================================

EARTH_RADIUS_KM = 6371  # Earth's radius in kilometers
DEFAULT_SEARCH_RADIUS_KM = 3  # Default proximity search radius
RATING_SCALE = {"MIN": 1, "MAX": 5}

# Ranking algorithm weights
RANKING_WEIGHTS = {
    "EXPERIENCE": 0.4,      # 40% weight on years of experience
    "SERVICE_FEE": 0.3,     # 30% weight on service fee
    "RATING": 0.2,          # 20% weight on customer rating
    "JOBS_COMPLETED": 0.1   # 10% weight on total jobs
}

# ============================================================================
# DATA CLASSES
# ============================================================================

@dataclass
class Location:
    """GPS coordinates"""
    latitude: float
    longitude: float
    
    def __post_init__(self):
        if not self.is_valid():
            raise ValueError("Invalid GPS coordinates")
    
    def is_valid(self) -> bool:
        """Validate coordinates"""
        return (
            -90 <= self.latitude <= 90 and
            -180 <= self.longitude <= 180
        )


@dataclass
class Artisan:
    """Artisan profile data"""
    id: str
    user_id: str
    full_name: str
    trade_category: str
    latitude: float
    longitude: float
    years_of_experience: int
    service_fee: float
    hourly_rate: float
    average_rating: float = 0.0
    total_ratings: int = 0
    total_jobs_completed: int = 0
    is_available: bool = True
    phone: str = ""
    bio: str = ""
    distance_km: float = 0.0
    ranking_score: float = 0.0


@dataclass
class Rating:
    """Rating data structure"""
    id: str
    booking_id: str
    rater_id: str
    ratee_id: str
    rater_type: str  # 'client' or 'artisan'
    stars: int
    review_text: str = ""
    professionalism_score: Optional[int] = None
    quality_score: Optional[int] = None
    communication_score: Optional[int] = None
    timeliness_score: Optional[int] = None
    value_for_money_score: Optional[int] = None
    is_visible: bool = True
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def __post_init__(self):
        if not (RATING_SCALE["MIN"] <= self.stars <= RATING_SCALE["MAX"]):
            raise ValueError(f"Stars must be between {RATING_SCALE['MIN']} and {RATING_SCALE['MAX']}")


@dataclass
class UserStats:
    """User rating statistics"""
    average_rating: float
    total_ratings: int


# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate distance between two GPS coordinates using Haversine formula
    
    Args:
        lat1: Latitude of point 1
        lon1: Longitude of point 1
        lat2: Latitude of point 2
        lon2: Longitude of point 2
    
    Returns:
        Distance in kilometers
    """
    # Convert degrees to radians
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    
    # Haversine formula
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2)
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance = EARTH_RADIUS_KM * c
    
    return distance


def normalize(value: float, min_val: float, max_val: float) -> float:
    """
    Normalize a value to a 0-1 scale for ranking calculations
    
    Args:
        value: The value to normalize
        min_val: Minimum value in dataset
        max_val: Maximum value in dataset
    
    Returns:
        Normalized value between 0 and 1
    """
    if max_val == min_val:
        return 0.5  # Avoid division by zero
    return (value - min_val) / (max_val - min_val)


# ============================================================================
# PROXIMITY SEARCH FUNCTION
# ============================================================================

def filter_artisans_by_proximity(
    user_location: Location,
    artisans: List[Artisan],
    radius_km: float = DEFAULT_SEARCH_RADIUS_KM
) -> List[Artisan]:
    """
    Filter artisans within specified radius of user's location
    
    Args:
        user_location: User's GPS coordinates
        artisans: List of artisan objects with location data
        radius_km: Search radius in kilometers (default: 3km)
    
    Returns:
        Filtered artisans with distance property added
    """
    nearby_artisans = []
    
    for artisan in artisans:
        # Calculate distance from user
        distance = calculate_distance(
            user_location.latitude,
            user_location.longitude,
            artisan.latitude,
            artisan.longitude
        )
        
        # Filter by radius
        if distance <= radius_km:
            artisan.distance_km = round(distance, 2)
            nearby_artisans.append(artisan)
    
    return nearby_artisans


# ============================================================================
# IGOWORK RANKING ALGORITHM
# ============================================================================

def get_dataset_stats(artisans: List[Artisan]) -> Dict[str, float]:
    """
    Get dataset statistics for normalization
    
    Args:
        artisans: List of artisan objects
    
    Returns:
        Dictionary with min/max statistics
    """
    if not artisans:
        return {
            "min_experience": 0,
            "max_experience": 1,
            "min_service_fee": 0,
            "max_service_fee": 1,
            "min_jobs": 0,
            "max_jobs": 1
        }
    
    experiences = [a.years_of_experience for a in artisans]
    service_fees = [a.service_fee for a in artisans]
    jobs = [a.total_jobs_completed for a in artisans]
    
    return {
        "min_experience": min(experiences),
        "max_experience": max(experiences),
        "min_service_fee": min(service_fees),
        "max_service_fee": max(service_fees),
        "min_jobs": min(jobs),
        "max_jobs": max(jobs)
    }


def calculate_ranking_score(artisan: Artisan, dataset_stats: Dict[str, float]) -> float:
    """
    Calculate IGOWork ranking score for an artisan
    
    Formula combines: experience, service fee, rating, and jobs completed
    Higher score = appears higher in results
    
    Args:
        artisan: Artisan object with required fields
        dataset_stats: Min/max values for normalization
    
    Returns:
        Calculated ranking score
    """
    # Normalize each factor to 0-1 scale
    normalized_experience = normalize(
        artisan.years_of_experience,
        dataset_stats["min_experience"],
        dataset_stats["max_experience"]
    )
    
    normalized_service_fee = normalize(
        artisan.service_fee,
        dataset_stats["min_service_fee"],
        dataset_stats["max_service_fee"]
    )
    
    normalized_rating = normalize(
        artisan.average_rating,
        RATING_SCALE["MIN"],
        RATING_SCALE["MAX"]
    )
    
    normalized_jobs = normalize(
        artisan.total_jobs_completed,
        dataset_stats["min_jobs"],
        dataset_stats["max_jobs"]
    )
    
    # Calculate weighted score
    ranking_score = (
        (normalized_experience * RANKING_WEIGHTS["EXPERIENCE"]) +
        (normalized_service_fee * RANKING_WEIGHTS["SERVICE_FEE"]) +
        (normalized_rating * RANKING_WEIGHTS["RATING"]) +
        (normalized_jobs * RANKING_WEIGHTS["JOBS_COMPLETED"])
    )
    
    # Scale to 0-1000 for easier interpretation
    return round(ranking_score * 1000, 2)


def find_and_rank_artisans(
    user_location: Location,
    artisans: List[Artisan],
    radius_km: float = DEFAULT_SEARCH_RADIUS_KM,
    trade_category: Optional[str] = None,
    min_rating: Optional[float] = None,
    max_service_fee: Optional[float] = None,
    limit: Optional[int] = None
) -> List[Artisan]:
    """
    Main function: Find and rank artisans near user
    
    Args:
        user_location: User's GPS coordinates
        artisans: All available artisans
        radius_km: Search radius in kilometers
        trade_category: Filter by specific trade
        min_rating: Minimum rating filter
        max_service_fee: Maximum service fee filter
        limit: Maximum number of results
    
    Returns:
        Sorted, ranked artisans within proximity
    """
    # Step 1: Filter by proximity
    nearby_artisans = filter_artisans_by_proximity(user_location, artisans, radius_km)
    
    # Step 2: Apply additional filters
    if trade_category:
        nearby_artisans = [
            a for a in nearby_artisans
            if a.trade_category.lower() == trade_category.lower()
        ]
    
    if min_rating is not None:
        nearby_artisans = [
            a for a in nearby_artisans
            if a.average_rating >= min_rating
        ]
    
    if max_service_fee is not None:
        nearby_artisans = [
            a for a in nearby_artisans
            if a.service_fee <= max_service_fee
        ]
    
    # Filter only available artisans
    nearby_artisans = [a for a in nearby_artisans if a.is_available]
    
    # Step 3: Calculate ranking scores
    dataset_stats = get_dataset_stats(nearby_artisans)
    
    for artisan in nearby_artisans:
        artisan.ranking_score = calculate_ranking_score(artisan, dataset_stats)
    
    # Step 4: Sort by ranking score (highest first)
    nearby_artisans.sort(key=lambda x: x.ranking_score, reverse=True)
    
    # Step 5: Apply limit if specified
    if limit and limit > 0:
        return nearby_artisans[:limit]
    
    return nearby_artisans


# ============================================================================
# MUTUAL RATING SYSTEM
# ============================================================================

def submit_rating(rating_data: Dict) -> Rating:
    """
    Submit a rating for a completed booking
    
    Args:
        rating_data: Rating submission data
    
    Returns:
        Created rating object
    """
    # Validate required fields
    required_fields = ["booking_id", "rater_id", "ratee_id", "rater_type", "stars"]
    for field in required_fields:
        if field not in rating_data:
            raise ValueError(f"Missing required field: {field}")
    
    # Create rating object
    rating = Rating(
        id=str(uuid.uuid4()),
        booking_id=rating_data["booking_id"],
        rater_id=rating_data["rater_id"],
        ratee_id=rating_data["ratee_id"],
        rater_type=rating_data["rater_type"],
        stars=rating_data["stars"],
        review_text=rating_data.get("review_text", ""),
        professionalism_score=rating_data.get("professionalism_score"),
        quality_score=rating_data.get("quality_score"),
        communication_score=rating_data.get("communication_score"),
        timeliness_score=rating_data.get("timeliness_score"),
        value_for_money_score=rating_data.get("value_for_money_score")
    )
    
    # In production, save to database here
    # db.ratings.create(rating)
    
    return rating


def update_user_rating(user_id: str, new_rating: int, current_stats: UserStats) -> UserStats:
    """
    Update user's average rating after receiving a new rating
    
    Args:
        user_id: ID of user whose rating is being updated
        new_rating: New rating received (1-5)
        current_stats: Current user statistics
    
    Returns:
        Updated rating statistics
    """
    # Calculate new average using incremental formula
    current_total = current_stats.average_rating * current_stats.total_ratings
    new_total = current_total + new_rating
    new_count = current_stats.total_ratings + 1
    new_average = new_total / new_count
    
    updated_stats = UserStats(
        average_rating=round(new_average, 2),
        total_ratings=new_count
    )
    
    # In production, update database
    # db.users.update(user_id, updated_stats)
    
    return updated_stats


def process_mutual_ratings(
    job_data: Dict,
    client_rating: Dict,
    artisan_rating: Dict
) -> Dict:
    """
    Process mutual ratings after job completion
    
    Args:
        job_data: Completed job data
        client_rating: Client's rating of artisan
        artisan_rating: Artisan's rating of client
    
    Returns:
        Results of rating process
    """
    booking_id = job_data["booking_id"]
    client_id = job_data["client_id"]
    artisan_id = job_data["artisan_id"]
    
    try:
        # Submit both ratings
        client_rating_record = submit_rating({
            "booking_id": booking_id,
            "rater_id": client_id,
            "ratee_id": artisan_id,
            "rater_type": "client",
            **client_rating
        })
        
        artisan_rating_record = submit_rating({
            "booking_id": booking_id,
            "rater_id": artisan_id,
            "ratee_id": client_id,
            "rater_type": "artisan",
            **artisan_rating
        })
        
        # Mock current stats (in production, fetch from database)
        artisan_current_stats = UserStats(average_rating=4.5, total_ratings=100)
        client_current_stats = UserStats(average_rating=4.8, total_ratings=50)
        
        # Update both users' average ratings
        artisan_new_stats = update_user_rating(
            artisan_id,
            client_rating["stars"],
            artisan_current_stats
        )
        
        client_new_stats = update_user_rating(
            client_id,
            artisan_rating["stars"],
            client_current_stats
        )
        
        return {
            "success": True,
            "client_rating": client_rating_record,
            "artisan_rating": artisan_rating_record,
            "updated_stats": {
                "artisan": artisan_new_stats,
                "client": client_new_stats
            }
        }
    except Exception as e:
        print(f"Error processing mutual ratings: {e}")
        raise


# ============================================================================
# EXAMPLE USAGE
# ============================================================================

if __name__ == "__main__":
    # Sample user location (Abuja, Nigeria)
    user_location = Location(latitude=9.0765, longitude=7.3986)
    
    # Sample artisans
    sample_artisans = [
        Artisan(
            id="a1",
            user_id="u1",
            full_name="Chukwudi Okonkwo",
            trade_category="plumber",
            latitude=9.0820,
            longitude=7.4010,
            years_of_experience=8,
            service_fee=10000,
            hourly_rate=5000,
            average_rating=4.8,
            total_ratings=120,
            total_jobs_completed=156
        ),
        Artisan(
            id="a2",
            user_id="u2",
            full_name="Aisha Mohammed",
            trade_category="electrician",
            latitude=9.0750,
            longitude=7.3990,
            years_of_experience=5,
            service_fee=8000,
            hourly_rate=4000,
            average_rating=4.6,
            total_ratings=85,
            total_jobs_completed=98
        ),
        Artisan(
            id="a3",
            user_id="u3",
            full_name="Fatima Bello",
            trade_category="plumber",
            latitude=9.0780,
            longitude=7.4005,
            years_of_experience=1,
            service_fee=4000,
            hourly_rate=2000,
            average_rating=3.8,
            total_ratings=12,
            total_jobs_completed=15
        )
    ]
    
    # Find and rank artisans
    print("=" * 80)
    print("IGOWork - Finding Plumbers Within 3km")
    print("=" * 80)
    
    results = find_and_rank_artisans(
        user_location,
        sample_artisans,
        trade_category="plumber"
    )
    
    print(f"\nFound {len(results)} plumbers:\n")
    
    for i, artisan in enumerate(results, 1):
        print(f"{i}. {artisan.full_name}")
        print(f"   Distance: {artisan.distance_km}km")
        print(f"   Experience: {artisan.years_of_experience} years")
        print(f"   Service Fee: ₦{artisan.service_fee:,.2f}")
        print(f"   Rating: {artisan.average_rating}⭐ ({artisan.total_ratings} reviews)")
        print(f"   Ranking Score: {artisan.ranking_score}/1000")
        print()
    
    print("=" * 80)
    print("Demonstrating Mutual Rating System")
    print("=" * 80)
    
    # Simulate job completion and ratings
    job_data = {
        "booking_id": "booking-123",
        "client_id": "client-456",
        "artisan_id": "artisan-789"
    }
    
    client_rating_data = {
        "stars": 5,
        "review_text": "Excellent work! Very professional.",
        "quality_score": 5,
        "communication_score": 5
    }
    
    artisan_rating_data = {
        "stars": 5,
        "review_text": "Great client! Prompt payment.",
        "communication_score": 5
    }
    
    result = process_mutual_ratings(job_data, client_rating_data, artisan_rating_data)
    
    print(f"\n✓ Ratings processed successfully!")
    print(f"\nArtisan new stats: {result['updated_stats']['artisan'].average_rating}/5.00")
    print(f"Client new stats: {result['updated_stats']['client'].average_rating}/5.00")
