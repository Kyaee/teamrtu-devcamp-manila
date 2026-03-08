-- Add photo_url column to flood_reports
ALTER TABLE public.flood_reports
  ADD COLUMN photo_url text DEFAULT NULL;

-- Add photo_url column to drain_reports
ALTER TABLE public.drain_reports
  ADD COLUMN photo_url text DEFAULT NULL;

-- Drop and recreate the flood_reports_with_latlng view to include photo_url
DROP VIEW IF EXISTS public.flood_reports_with_latlng;
CREATE VIEW public.flood_reports_with_latlng AS
  SELECT
    id,
    st_y(location::geometry) AS lat,
    st_x(location::geometry) AS lng,
    depth,
    status,
    reporter_label,
    barangay,
    photo_url,
    created_at
  FROM flood_reports;

-- Drop and recreate the drain_reports_with_latlng view to include photo_url
DROP VIEW IF EXISTS public.drain_reports_with_latlng;
CREATE VIEW public.drain_reports_with_latlng AS
  SELECT
    id,
    st_y(location::geometry) AS lat,
    st_x(location::geometry) AS lng,
    description,
    photo_url,
    status,
    created_at
  FROM drain_reports;

-- Storage RLS policies for the 'image' bucket so anon users can upload & read
CREATE POLICY "Allow public read on image bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'image');

CREATE POLICY "Allow anon upload to image bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'image');
