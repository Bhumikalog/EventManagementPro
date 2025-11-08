-- Create app_role enum for role management
CREATE TYPE public.app_role AS ENUM ('organizer', 'participant');

-- Create registration_status enum
CREATE TYPE public.registration_status AS ENUM ('confirmed', 'cancelled', 'waitlist');

-- Create ticket_kind enum
CREATE TYPE public.ticket_kind AS ENUM ('free', 'paid', 'donation');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  role public.app_role NOT NULL DEFAULT 'participant',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table for granular role management
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create venues table
CREATE TABLE public.venues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  capacity INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

-- Create events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  venue_name TEXT,
  venue_location TEXT,
  start_ts TIMESTAMPTZ NOT NULL,
  end_ts TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  capacity INTEGER,
  status TEXT NOT NULL DEFAULT 'upcoming',
  organizer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  recurrence_rule TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Create ticket_types table
CREATE TABLE public.ticket_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  kind public.ticket_kind NOT NULL DEFAULT 'free',
  price NUMERIC(10,2),
  capacity INTEGER,
  sold_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ticket_types ENABLE ROW LEVEL SECURITY;

-- Create registrations table
CREATE TABLE public.registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ticket_type_id UUID REFERENCES public.ticket_types(id) ON DELETE SET NULL,
  status public.registration_status NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Create function to handle user profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'participant')
  );
  
  -- Also add to user_roles table
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'participant')
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add update triggers for tables with updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_venues_updated_at
  BEFORE UPDATE ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create function to increment ticket sold count
CREATE OR REPLACE FUNCTION public.increment_ticket_sold_count(ticket_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.ticket_types
  SET sold_count = sold_count + 1
  WHERE id = ticket_id;
END;
$$;

-- Create function to decrement ticket sold count
CREATE OR REPLACE FUNCTION public.decrement_ticket_sold_count(ticket_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.ticket_types
  SET sold_count = GREATEST(sold_count - 1, 0)
  WHERE id = ticket_id;
END;
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view all roles"
  ON public.user_roles FOR SELECT
  USING (true);

CREATE POLICY "Only organizers can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'organizer'));

-- RLS Policies for venues
CREATE POLICY "Everyone can view venues"
  ON public.venues FOR SELECT
  USING (true);

CREATE POLICY "Organizers can create venues"
  ON public.venues FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'organizer'));

CREATE POLICY "Organizers can update venues"
  ON public.venues FOR UPDATE
  USING (public.has_role(auth.uid(), 'organizer'));

CREATE POLICY "Organizers can delete venues"
  ON public.venues FOR DELETE
  USING (public.has_role(auth.uid(), 'organizer'));

-- RLS Policies for events
CREATE POLICY "Everyone can view events"
  ON public.events FOR SELECT
  USING (true);

CREATE POLICY "Organizers can create events"
  ON public.events FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'organizer'));

CREATE POLICY "Organizers can update their own events"
  ON public.events FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'organizer') AND 
    (organizer_id = auth.uid() OR organizer_id IS NULL)
  );

CREATE POLICY "Organizers can delete their own events"
  ON public.events FOR DELETE
  USING (
    public.has_role(auth.uid(), 'organizer') AND 
    (organizer_id = auth.uid() OR organizer_id IS NULL)
  );

-- RLS Policies for ticket_types
CREATE POLICY "Everyone can view ticket types"
  ON public.ticket_types FOR SELECT
  USING (true);

CREATE POLICY "Organizers can manage ticket types for their events"
  ON public.ticket_types FOR ALL
  USING (
    public.has_role(auth.uid(), 'organizer') AND
    EXISTS (
      SELECT 1 FROM public.events
      WHERE id = event_id AND (organizer_id = auth.uid() OR organizer_id IS NULL)
    )
  );

-- RLS Policies for registrations
CREATE POLICY "Users can view their own registrations"
  ON public.registrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Organizers can view all registrations for their events"
  ON public.registrations FOR SELECT
  USING (
    public.has_role(auth.uid(), 'organizer') AND
    EXISTS (
      SELECT 1 FROM public.events
      WHERE id = event_id AND (organizer_id = auth.uid() OR organizer_id IS NULL)
    )
  );

CREATE POLICY "Users can create their own registrations"
  ON public.registrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own registrations"
  ON public.registrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Organizers can update registrations for their events"
  ON public.registrations FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'organizer') AND
    EXISTS (
      SELECT 1 FROM public.events
      WHERE id = event_id AND (organizer_id = auth.uid() OR organizer_id IS NULL)
    )
  );

CREATE POLICY "Users can delete their own registrations"
  ON public.registrations FOR DELETE
  USING (auth.uid() = user_id);