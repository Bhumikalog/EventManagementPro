-- Add checked_in_at column to registrations table
ALTER TABLE public.registrations 
ADD COLUMN checked_in_at timestamp with time zone;

-- Create index for efficient check-in queries
CREATE INDEX idx_registrations_checked_in ON public.registrations(event_id, checked_in_at) 
WHERE checked_in_at IS NOT NULL;