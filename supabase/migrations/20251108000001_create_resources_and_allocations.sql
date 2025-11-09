-- Migration: create resources and resource_allocations tables
-- Run this against your Supabase/Postgres database

CREATE TABLE IF NOT EXISTS resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text,
  location text,
  capacity integer,
  status text DEFAULT 'available',
  allocated_to text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resource_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid REFERENCES resources(id) ON DELETE CASCADE,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  organizer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text,
  allocated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resources_name ON resources(name);
CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
CREATE INDEX IF NOT EXISTS idx_allocations_organizer ON resource_allocations(organizer_id);
CREATE INDEX IF NOT EXISTS idx_allocations_resource ON resource_allocations(resource_id);
