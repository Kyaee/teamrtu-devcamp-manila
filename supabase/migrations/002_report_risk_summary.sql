-- Report Risk Summary RPC + supporting indexes
-- Provides server-side aggregation of nearby flood/drain reports for
-- efficient Gemini prompt context and risk annotation.

-- Composite index for faster flood report proximity + recency queries
CREATE INDEX IF NOT EXISTS idx_flood_reports_confirmed_recent
  ON flood_reports (status, created_at DESC)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_drain_reports_recent
  ON drain_reports (created_at DESC);

-- Aggregated nearby report summary for a given point.
-- Returns counts by type and depth within a radius and 24h window.
-- Used by the app to build compact risk context for Gemini prompts.

CREATE OR REPLACE FUNCTION nearby_report_summary(
  p_lat float8,
  p_lng float8,
  p_radius_m float8 DEFAULT 200
)
RETURNS TABLE (
  flood_pending_count int,
  flood_confirmed_count int,
  flood_confirmed_high_count int,
  drain_count int
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    (
      SELECT count(*)::int FROM flood_reports
      WHERE status = 'pending'
        AND created_at > now() - interval '24 hours'
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radius_m
        )
    ) AS flood_pending_count,
    (
      SELECT count(*)::int FROM flood_reports
      WHERE status = 'confirmed'
        AND created_at > now() - interval '24 hours'
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radius_m
        )
    ) AS flood_confirmed_count,
    (
      SELECT count(*)::int FROM flood_reports
      WHERE status = 'confirmed'
        AND depth IN ('waist', 'chest')
        AND created_at > now() - interval '24 hours'
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radius_m
        )
    ) AS flood_confirmed_high_count,
    (
      SELECT count(*)::int FROM drain_reports
      WHERE created_at > now() - interval '24 hours'
        AND ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          p_radius_m
        )
    ) AS drain_count;
$$;
