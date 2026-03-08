-- Urgent rescue markers for shared real-time emergency visibility

CREATE TABLE IF NOT EXISTS urgent_rescue_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location geography(Point, 4326) NOT NULL,
  urgency_level text NOT NULL CHECK (urgency_level IN ('high', 'very_urgent')),
  summary text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_urgent_rescue_markers_location
  ON urgent_rescue_markers USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_urgent_rescue_markers_status_created
  ON urgent_rescue_markers (status, created_at DESC);

ALTER TABLE urgent_rescue_markers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "urgent_rescue_markers_select"
  ON urgent_rescue_markers FOR SELECT USING (true);

CREATE POLICY "urgent_rescue_markers_insert"
  ON urgent_rescue_markers FOR INSERT WITH CHECK (true);

CREATE POLICY "urgent_rescue_markers_update"
  ON urgent_rescue_markers FOR UPDATE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE urgent_rescue_markers;
