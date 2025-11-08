-- Add venue details directly to events table
ALTER TABLE events ADD COLUMN venue_name text;
ALTER TABLE events ADD COLUMN venue_location text;

-- Make venue_id nullable since we'll store venue details directly
ALTER TABLE events ALTER COLUMN venue_id DROP NOT NULL;