-- Migration to create checkins table
CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resource_id uuid REFERENCES resources(id) ON DELETE SET NULL,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  timestamp timestamptz DEFAULT now(),
  status text DEFAULT 'checked_in'
);

CREATE INDEX IF NOT EXISTS idx_checkins_event ON checkins(event_id);
CREATE INDEX IF NOT EXISTS idx_checkins_resource ON checkins(resource_id);
CREATE INDEX IF NOT EXISTS idx_checkins_participant ON checkins(participant_id);
