-- ============================================================================
-- IGOWork Database Schema
-- ============================================================================
-- A complete relational database schema for the artisan booking platform
-- Supports proximity search, ranking, and mutual feedback systems
-- ============================================================================

-- Users table (both clients and artisans)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    profile_image_url TEXT,
    user_type ENUM('client', 'artisan', 'both') NOT NULL DEFAULT 'client',
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Rating fields (updated after each job)
    average_rating DECIMAL(3, 2) DEFAULT 0.00,
    total_ratings INTEGER DEFAULT 0,
    
    -- Metadata
    last_login_at TIMESTAMP,
    fcm_token TEXT -- For push notifications
);

-- Artisan profiles (additional data for service providers)
CREATE TABLE artisan_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    
    -- Location data for proximity search
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    
    -- Professional details
    trade_category VARCHAR(100) NOT NULL, -- e.g., 'plumber', 'electrician', 'carpenter'
    years_of_experience INTEGER NOT NULL DEFAULT 0,
    certification_urls TEXT[], -- Array of certificate image URLs
    bio TEXT,
    
    -- Pricing
    hourly_rate DECIMAL(10, 2) NOT NULL,
    service_fee DECIMAL(10, 2) NOT NULL, -- Base service call fee
    
    -- Business metrics
    total_jobs_completed INTEGER DEFAULT 0,
    total_earnings DECIMAL(12, 2) DEFAULT 0.00,
    
    -- Availability
    is_available BOOLEAN DEFAULT TRUE,
    availability_schedule JSONB, -- Store weekly schedule
    
    -- IGOWork ranking score (computed field)
    ranking_score DECIMAL(10, 4) DEFAULT 0.0000,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Trade categories lookup table
CREATE TABLE trade_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon_url TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

-- Client profiles (optional additional data)
CREATE TABLE client_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    
    -- Default location for service requests
    default_latitude DECIMAL(10, 8),
    default_longitude DECIMAL(11, 8),
    default_address TEXT,
    
    total_bookings INTEGER DEFAULT 0,
    total_spent DECIMAL(12, 2) DEFAULT 0.00,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Bookings/Jobs table
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Parties involved
    client_id UUID NOT NULL,
    artisan_id UUID NOT NULL,
    
    -- Job details
    trade_category VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    
    -- Location
    service_latitude DECIMAL(10, 8) NOT NULL,
    service_longitude DECIMAL(11, 8) NOT NULL,
    service_address TEXT NOT NULL,
    
    -- Pricing
    quoted_price DECIMAL(10, 2),
    final_price DECIMAL(10, 2),
    service_fee DECIMAL(10, 2) NOT NULL,
    
    -- Status tracking
    status ENUM(
        'pending',           -- Client created request
        'quoted',            -- Artisan provided quote
        'accepted',          -- Client accepted quote
        'in_progress',       -- Job is ongoing
        'completed',         -- Job finished, awaiting payment
        'paid',              -- Payment received
        'cancelled_client',  -- Cancelled by client
        'cancelled_artisan', -- Cancelled by artisan
        'disputed'           -- Issue requires resolution
    ) NOT NULL DEFAULT 'pending',
    
    -- Scheduling
    requested_date DATE,
    requested_time TIME,
    scheduled_datetime TIMESTAMP,
    completed_datetime TIMESTAMP,
    
    -- Images
    request_images TEXT[], -- Photos from client
    completion_images TEXT[], -- Photos from artisan
    
    -- Notes
    client_notes TEXT,
    artisan_notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (client_id) REFERENCES users(id),
    FOREIGN KEY (artisan_id) REFERENCES users(id)
);

-- Ratings table (mutual feedback system)
CREATE TABLE ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    
    -- Who is rating whom
    rater_id UUID NOT NULL,      -- Person giving the rating
    ratee_id UUID NOT NULL,      -- Person receiving the rating
    rater_type ENUM('client', 'artisan') NOT NULL,
    
    -- Rating details
    stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
    review_text TEXT,
    
    -- Specific criteria (optional, for detailed feedback)
    professionalism_score INTEGER CHECK (professionalism_score BETWEEN 1 AND 5),
    quality_score INTEGER CHECK (quality_score BETWEEN 1 AND 5),
    communication_score INTEGER CHECK (communication_score BETWEEN 1 AND 5),
    timeliness_score INTEGER CHECK (timeliness_score BETWEEN 1 AND 5),
    value_for_money_score INTEGER CHECK (value_for_money_score BETWEEN 1 AND 5),
    
    -- Metadata
    is_visible BOOLEAN DEFAULT TRUE, -- Can be hidden if flagged
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (booking_id) REFERENCES bookings(id),
    FOREIGN KEY (rater_id) REFERENCES users(id),
    FOREIGN KEY (ratee_id) REFERENCES users(id),
    
    -- Ensure each party can only rate once per booking
    UNIQUE(booking_id, rater_id)
);

-- ============================================================================
-- Indexes for Performance Optimization
-- ============================================================================

-- Critical for proximity search (use PostGIS for production)
CREATE INDEX idx_artisan_location ON artisan_profiles(latitude, longitude);

-- For ranking algorithm
CREATE INDEX idx_artisan_ranking ON artisan_profiles(ranking_score DESC);
CREATE INDEX idx_artisan_experience ON artisan_profiles(years_of_experience DESC);
CREATE INDEX idx_artisan_service_fee ON artisan_profiles(service_fee DESC);

-- For filtering by trade
CREATE INDEX idx_artisan_trade ON artisan_profiles(trade_category);
CREATE INDEX idx_artisan_available ON artisan_profiles(is_available);

-- For booking queries
CREATE INDEX idx_booking_client ON bookings(client_id);
CREATE INDEX idx_booking_artisan ON bookings(artisan_id);
CREATE INDEX idx_booking_status ON bookings(status);
CREATE INDEX idx_booking_created ON bookings(created_at DESC);

-- For ratings
CREATE INDEX idx_rating_ratee ON ratings(ratee_id);
CREATE INDEX idx_rating_booking ON ratings(booking_id);

-- User lookups
CREATE INDEX idx_user_email ON users(email);
CREATE INDEX idx_user_type ON users(user_type);

-- ============================================================================
-- Sample Data Structure (JSON format for reference)
-- ============================================================================

/*
User Object:
{
  "id": "uuid-v4",
  "email": "john@example.com",
  "full_name": "John Doe",
  "phone": "+234-800-123-4567",
  "user_type": "client",
  "average_rating": 4.75,
  "total_ratings": 20,
  "is_verified": true,
  "is_active": true
}

Artisan Profile Object:
{
  "id": "uuid-v4",
  "user_id": "user-uuid",
  "latitude": 9.0765,
  "longitude": 7.3986,
  "trade_category": "plumber",
  "years_of_experience": 8,
  "hourly_rate": 5000.00,
  "service_fee": 10000.00,
  "total_jobs_completed": 156,
  "average_rating": 4.8,
  "ranking_score": 856.4,
  "is_available": true,
  "availability_schedule": {
    "monday": {"start": "08:00", "end": "18:00"},
    "tuesday": {"start": "08:00", "end": "18:00"},
    "wednesday": {"start": "08:00", "end": "18:00"}
  }
}

Booking Object:
{
  "id": "uuid-v4",
  "client_id": "client-uuid",
  "artisan_id": "artisan-uuid",
  "trade_category": "electrician",
  "title": "Fix bedroom wiring",
  "description": "Need urgent repair for faulty socket",
  "service_latitude": 9.0820,
  "service_longitude": 7.4010,
  "service_address": "123 Main St, Abuja",
  "status": "completed",
  "quoted_price": 15000.00,
  "final_price": 15000.00,
  "service_fee": 5000.00,
  "scheduled_datetime": "2026-02-05T10:00:00Z",
  "completed_datetime": "2026-02-05T12:30:00Z"
}

Rating Object:
{
  "id": "uuid-v4",
  "booking_id": "booking-uuid",
  "rater_id": "client-uuid",
  "ratee_id": "artisan-uuid",
  "rater_type": "client",
  "stars": 5,
  "review_text": "Excellent work! Professional and on time.",
  "professionalism_score": 5,
  "quality_score": 5,
  "communication_score": 5,
  "timeliness_score": 4,
  "value_for_money_score": 5
}
*/
