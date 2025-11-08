-- Create attendees table with RSVP functionality
CREATE TABLE IF NOT EXISTS public.attendees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  rsvp_status TEXT NOT NULL DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'accepted', 'declined')),
  is_waitlisted BOOLEAN NOT NULL DEFAULT false,
  waitlist_position INTEGER,
  registration_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.attendees ENABLE ROW LEVEL SECURITY;

-- RLS Policies for attendees
CREATE POLICY "Organizers can view all attendees"
  ON public.attendees FOR SELECT
  USING (has_role(auth.uid(), 'organizer'::app_role));

CREATE POLICY "Attendees can view their own record"
  ON public.attendees FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Organizers can insert attendees"
  ON public.attendees FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'organizer'::app_role));

CREATE POLICY "Organizers can update attendees"
  ON public.attendees FOR UPDATE
  USING (has_role(auth.uid(), 'organizer'::app_role));

CREATE POLICY "Organizers can delete attendees"
  ON public.attendees FOR DELETE
  USING (has_role(auth.uid(), 'organizer'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_attendees_updated_at
  BEFORE UPDATE ON public.attendees
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();