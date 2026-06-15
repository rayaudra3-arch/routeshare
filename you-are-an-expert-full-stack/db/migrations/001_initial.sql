PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Rider', 'Driver')),
  authorized_roles TEXT NOT NULL DEFAULT '["Rider"]',
  wallet_balance_cents INTEGER NOT NULL DEFAULT 0,
  verified_status TEXT NOT NULL DEFAULT 'Pending' CHECK (verified_status IN ('Pending', 'Verified', 'Rejected')),
  stripe_customer_id TEXT,
  stripe_connect_account_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_lat REAL NOT NULL,
  start_lng REAL NOT NULL,
  start_label TEXT NOT NULL,
  end_lat REAL NOT NULL,
  end_lng REAL NOT NULL,
  end_label TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  max_capacity INTEGER NOT NULL CHECK (max_capacity > 0),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Active', 'Completed', 'Cancelled')),
  base_duration_seconds INTEGER NOT NULL DEFAULT 0,
  base_distance_meters INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  rider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pickup_lat REAL NOT NULL,
  pickup_lng REAL NOT NULL,
  pickup_label TEXT NOT NULL,
  dropoff_lat REAL NOT NULL,
  dropoff_lng REAL NOT NULL,
  dropoff_label TEXT NOT NULL,
  fare_amount_cents INTEGER NOT NULL CHECK (fare_amount_cents >= 0),
  match_status TEXT NOT NULL DEFAULT 'Pending' CHECK (match_status IN ('Pending', 'Accepted', 'Rejected', 'Paid', 'Cancelled')),
  check_in_status TEXT NOT NULL DEFAULT 'Pending' CHECK (check_in_status IN ('Pending', 'RiderInitiated', 'DriverChecked', 'RiderConfirmed')),
  rider_check_in_at TEXT,
  driver_check_in_at TEXT,
  rider_confirmed_at TEXT,
  fare_locked_at TEXT,
  eta_pickup_time TEXT,
  match_score INTEGER NOT NULL DEFAULT 0,
  detour_seconds INTEGER NOT NULL DEFAULT 0,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(trip_id, rider_id)
);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  week_ending_date TEXT NOT NULL,
  payout_status TEXT NOT NULL DEFAULT 'Pending' CHECK (payout_status IN ('Pending', 'Processing', 'Paid', 'Failed')),
  stripe_transfer_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(driver_id, week_ending_date)
);

CREATE TABLE IF NOT EXISTS payout_fares (
  payout_id TEXT NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  PRIMARY KEY (payout_id, booking_id)
);

CREATE INDEX IF NOT EXISTS idx_trips_driver_time ON trips(driver_id, departure_time);
CREATE INDEX IF NOT EXISTS idx_bookings_trip_status ON bookings(trip_id, match_status);
CREATE INDEX IF NOT EXISTS idx_bookings_rider ON bookings(rider_id);
CREATE INDEX IF NOT EXISTS idx_payouts_driver_week ON payouts(driver_id, week_ending_date);
