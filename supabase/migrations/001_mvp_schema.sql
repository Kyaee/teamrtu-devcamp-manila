-- AGOS MVP Schema Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)

-- 1. Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. MVP Tables

CREATE TABLE IF NOT EXISTS flood_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location geography(Point, 4326) NOT NULL,
  depth text NOT NULL CHECK (depth IN ('ankle', 'knee', 'waist', 'chest')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  reporter_label text NOT NULL DEFAULT 'Community report',
  barangay text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drain_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location geography(Point, 4326) NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay text NOT NULL,
  city text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('MONITOR', 'PREPARE', 'LEAVE', 'EVACUATE')),
  headline text NOT NULL,
  instruction text NOT NULL,
  primary_cta_label text NOT NULL DEFAULT '',
  primary_cta_path text NOT NULL DEFAULT '',
  rationale text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evac_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  barangay text NOT NULL,
  address text NOT NULL,
  location geography(Point, 4326) NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'limited')),
  uncertainty_note text NOT NULL DEFAULT 'Conditions may change; verify on arrival.'
);

CREATE TABLE IF NOT EXISTS flood_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barangay text NOT NULL,
  city text NOT NULL,
  center_lat float8 NOT NULL,
  center_lng float8 NOT NULL,
  risk_level text NOT NULL DEFAULT 'moderate' CHECK (risk_level IN ('low', 'moderate', 'high'))
);

CREATE TABLE IF NOT EXISTS registered_buddies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  barangay text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Phase-2 tables (schema only, not used in MVP)

CREATE TABLE IF NOT EXISTS family_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL,
  barangay text NOT NULL,
  head_phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS relief_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES family_records(id),
  event_id text NOT NULL,
  claim_type text NOT NULL DEFAULT 'food',
  status text NOT NULL DEFAULT 'registered',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, event_id)
);

CREATE TABLE IF NOT EXISTS donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_phone text NOT NULL,
  amount_php numeric NOT NULL DEFAULT 0,
  cause text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  otp_code text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Indexes

CREATE INDEX IF NOT EXISTS idx_flood_reports_location ON flood_reports USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_evac_centers_location ON evac_centers USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_drain_reports_location ON drain_reports USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_alerts_barangay_severity ON alerts (barangay, severity);
CREATE INDEX IF NOT EXISTS idx_flood_reports_status_created ON flood_reports (status, created_at DESC);

-- 4. RLS Policies

ALTER TABLE flood_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE drain_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE evac_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE flood_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE registered_buddies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flood_reports_select" ON flood_reports FOR SELECT USING (true);
CREATE POLICY "flood_reports_insert" ON flood_reports FOR INSERT WITH CHECK (true);

CREATE POLICY "drain_reports_select" ON drain_reports FOR SELECT USING (true);
CREATE POLICY "drain_reports_insert" ON drain_reports FOR INSERT WITH CHECK (true);

CREATE POLICY "alerts_select" ON alerts FOR SELECT USING (true);

CREATE POLICY "evac_centers_select" ON evac_centers FOR SELECT USING (true);

CREATE POLICY "flood_zones_select" ON flood_zones FOR SELECT USING (true);

CREATE POLICY "registered_buddies_select" ON registered_buddies FOR SELECT USING (true);
CREATE POLICY "registered_buddies_insert" ON registered_buddies FOR INSERT WITH CHECK (true);

-- 5. Geospatial function: count nearby flood reports within radius

CREATE OR REPLACE FUNCTION check_nearby_report_count(
  p_lat float8,
  p_lng float8,
  p_radius_m float8 DEFAULT 200,
  p_min_count int DEFAULT 3
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT count(*) >= p_min_count
  FROM flood_reports
  WHERE ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_radius_m
  )
  AND status = 'pending'
  AND created_at > now() - interval '24 hours';
$$;

-- Helper: confirm nearby pending reports when threshold is met

CREATE OR REPLACE FUNCTION confirm_nearby_reports(
  p_lat float8,
  p_lng float8,
  p_radius_m float8 DEFAULT 200
)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE flood_reports
  SET status = 'confirmed'
  WHERE status = 'pending'
    AND ST_DWithin(
      location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
    AND created_at > now() - interval '24 hours';
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Helper: find evac centers within radius of a point

CREATE OR REPLACE FUNCTION nearby_evac_centers(
  p_lat float8,
  p_lng float8,
  p_radius_km float8 DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  name text,
  barangay text,
  address text,
  lat float8,
  lng float8,
  status text,
  uncertainty_note text,
  distance_km float8
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ec.id,
    ec.name,
    ec.barangay,
    ec.address,
    ST_Y(ec.location::geometry) AS lat,
    ST_X(ec.location::geometry) AS lng,
    ec.status,
    ec.uncertainty_note,
    ST_Distance(
      ec.location,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    ) / 1000.0 AS distance_km
  FROM evac_centers ec
  WHERE ST_DWithin(
    ec.location,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_radius_km * 1000
  )
  ORDER BY distance_km;
$$;

-- 6. Seed Data

INSERT INTO alerts (barangay, city, severity, headline, instruction, primary_cta_label, primary_cta_path, rationale) VALUES
  ('Concepcion Dos', 'Marikina', 'PREPARE', 'Maghanda na', 'Posibleng bahain ang barangay sa loob ng 2 oras.', 'Hanapin ang Shelter', '/(tabs)/centers', 'Batay sa ulan, antas ng tubig, at ulat ng komunidad.'),
  ('Tañong', 'Malabon', 'LEAVE', 'Umalis sa loob ng 30 minuto', 'Tumungo sa pinakamalapit na evacuation center.', 'Tingnan ang Ruta', '/(tabs)/centers', 'May tumataas na tubig at dumaraming confirmed reports.');

INSERT INTO evac_centers (name, barangay, address, location, status, uncertainty_note) VALUES
  ('Marikina Elementary School Shelter', 'Concepcion Dos', 'Bayan-Bayanan Avenue, Marikina', ST_SetSRID(ST_MakePoint(121.1023, 14.6308), 4326)::geography, 'open', 'Best available route guidance. Conditions can change quickly.'),
  ('Tañong Barangay Hall', 'Tañong', 'Gen. Luna Street, Malabon', ST_SetSRID(ST_MakePoint(120.9565, 14.6575), 4326)::geography, 'limited', 'Capacity can change; verify with barangay staff on arrival.');

INSERT INTO flood_reports (location, depth, status, reporter_label, barangay) VALUES
  (ST_SetSRID(ST_MakePoint(121.1, 14.632), 4326)::geography, 'knee', 'confirmed', 'Community report', 'Concepcion Dos'),
  (ST_SetSRID(ST_MakePoint(121.093, 14.621), 4326)::geography, 'waist', 'pending', 'Flood Buddy relay', 'Concepcion Dos');

INSERT INTO flood_zones (barangay, city, center_lat, center_lng, risk_level) VALUES
  ('Concepcion Dos', 'Marikina', 14.6308, 121.1023, 'high'),
  ('Tañong', 'Malabon', 14.6575, 120.9565, 'high'),
  ('Tangos', 'Navotas', 14.6667, 120.9417, 'moderate'),
  ('Rosario', 'Pasig', 14.5764, 121.0851, 'moderate');

-- 7. Enable Realtime (run in Supabase Dashboard > Database > Replication)
-- Or use SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE flood_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE drain_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE evac_centers;
