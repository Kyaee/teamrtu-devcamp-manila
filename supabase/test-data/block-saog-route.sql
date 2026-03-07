-- ============================================================================
-- CLEANUP: Remove previous test data
-- ============================================================================
-- Run this first to clear old Saog test reports and alerts.

DELETE FROM flood_reports WHERE reporter_label LIKE 'Test:%';
DELETE FROM alerts WHERE rationale LIKE 'Test scenario:%';
DELETE FROM flood_zones WHERE barangay = 'Saog' AND city = 'Meycauayan' AND risk_level = 'high';

-- ============================================================================
-- TEST CASE: Flood T. Mendoza Street to force reroute
-- ============================================================================
-- T. Mendoza Street is a key road in Meycauayan town proper.
-- Flooding it should block routes that pass through it, forcing the
-- decision engine to recommend Heritage Bible Christian Academy
-- or another nearby evacuation center instead.
--
-- T. Mendoza Street runs roughly NW-SE through the town center.
-- Approximate coordinates: 14.7580–14.7610, 120.9590–120.9620
--
-- We place 7 confirmed high-depth flood reports spread along
-- the street (~50m apart) so routes passing through have enough
-- polyline points flagged to exceed the 15% hazard threshold.
-- ============================================================================

-- 1. Flood reports along T. Mendoza Street
INSERT INTO flood_reports (location, depth, status, reporter_label, barangay) VALUES
  -- South end of T. Mendoza St (near intersection)
  (ST_SetSRID(ST_MakePoint(120.9594, 14.7578), 4326)::geography,
   'chest', 'confirmed', 'Test: T. Mendoza south end', 'Poblacion'),

  -- ~50m north
  (ST_SetSRID(ST_MakePoint(120.9597, 14.7582), 4326)::geography,
   'waist', 'confirmed', 'Test: T. Mendoza near sari-sari', 'Poblacion'),

  -- ~100m north (mid-street)
  (ST_SetSRID(ST_MakePoint(120.9600, 14.7587), 4326)::geography,
   'chest', 'confirmed', 'Test: T. Mendoza midpoint', 'Poblacion'),

  -- ~150m north
  (ST_SetSRID(ST_MakePoint(120.9603, 14.7592), 4326)::geography,
   'waist', 'confirmed', 'Test: T. Mendoza near crossing', 'Poblacion'),

  -- ~200m north
  (ST_SetSRID(ST_MakePoint(120.9607, 14.7597), 4326)::geography,
   'chest', 'confirmed', 'Test: T. Mendoza north section', 'Poblacion'),

  -- ~250m north (near next intersection)
  (ST_SetSRID(ST_MakePoint(120.9610, 14.7602), 4326)::geography,
   'waist', 'confirmed', 'Test: T. Mendoza north intersection', 'Poblacion'),

  -- ~300m north end
  (ST_SetSRID(ST_MakePoint(120.9614, 14.7608), 4326)::geography,
   'chest', 'confirmed', 'Test: T. Mendoza north end', 'Poblacion');

-- 2. PREPARE-level alert for Meycauayan Poblacion
INSERT INTO alerts (barangay, city, severity, headline, instruction, primary_cta_label, primary_cta_path, rationale)
VALUES (
  'Poblacion',
  'Meycauayan',
  'PREPARE',
  'Baha sa T. Mendoza St — maghanda na',
  'Tumataas ang baha sa T. Mendoza Street. Iwasan ang lugar at mag-evacuate kung kailangan.',
  'Hanapin ang Shelter',
  '/(tabs)/centers',
  'Test scenario: flooding along T. Mendoza Street, Meycauayan.'
);

-- 3. High-risk flood zone for Poblacion (center of the flooded stretch)
INSERT INTO flood_zones (barangay, city, center_lat, center_lng, risk_level)
VALUES ('Poblacion', 'Meycauayan', 14.7592, 120.9603, 'high')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check: flood reports inserted along T. Mendoza St
-- SELECT id, depth, status, reporter_label,
--        ST_Y(location::geometry) AS lat,
--        ST_X(location::geometry) AS lng
-- FROM flood_reports
-- WHERE reporter_label LIKE 'Test: T. Mendoza%'
-- ORDER BY ST_Y(location::geometry);

-- Check: should return TRUE (3+ confirmed within 200m of midpoint)
-- SELECT check_nearby_report_count(14.7592, 120.9603, 200, 3);

-- Check: nearby report summary at street midpoint
-- SELECT * FROM nearby_report_summary(14.7592, 120.9603, 300);

-- Check: alert exists
-- SELECT barangay, city, severity, headline FROM alerts
-- WHERE rationale LIKE 'Test scenario:%';
