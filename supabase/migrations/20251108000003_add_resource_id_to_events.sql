-- Add resource_id column to events so events can be linked to a resource from resources table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL;

-- Optional index to speed up lookups
CREATE INDEX IF NOT EXISTS idx_events_resource ON public.events(resource_id);
