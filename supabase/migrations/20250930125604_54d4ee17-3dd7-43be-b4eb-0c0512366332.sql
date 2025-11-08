-- Function to increment ticket sold count
CREATE OR REPLACE FUNCTION public.increment_ticket_sold_count(ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ticket_types
  SET sold_count = sold_count + 1
  WHERE id = ticket_id;
END;
$$;

-- Function to decrement ticket sold count
CREATE OR REPLACE FUNCTION public.decrement_ticket_sold_count(ticket_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ticket_types
  SET sold_count = GREATEST(0, sold_count - 1)
  WHERE id = ticket_id;
END;
$$;