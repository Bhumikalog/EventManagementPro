CREATE OR REPLACE FUNCTION get_my_registrations()
RETURNS TABLE (
  order_id uuid,
  event_id uuid,
  ticket_type_id uuid,
  registration_id uuid,
  qr_code_data text,
  payment_status text,
  amount int,
  created_at timestamp_tz,
  event_title text,
  event_start_ts timestamptz,
  event_venue_name text,
  event_venue_location text,
  event_description text,
  ticket_name text,
  ticket_kind text,
  ticket_price int,
  registration_status text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id AS order_id,
    o.event_id,
    o.ticket_type_id,
    o.registration_id,
    o.qr_code_data,
    o.payment_status,
    o.amount,
    o.created_at,
    e.title AS event_title,
    e.start_ts AS event_start_ts,
    e.venue_name AS event_venue_name,
    e.venue_location AS event_venue_location,
    e.description AS event_description,
    tt.name AS ticket_name,
    tt.kind AS ticket_kind,
    tt.price AS ticket_price,
    r.registration_status
  FROM
    public.orders o
    LEFT JOIN public.events e ON o.event_id = e.id
    LEFT JOIN public.ticket_types tt ON o.ticket_type_id = tt.id
    LEFT JOIN public.registrations r ON o.registration_id = r.id
  WHERE
    o.user_id = auth.uid()
    AND o.payment_status = 'completed'
  ORDER BY
    o.created_at DESC;
END;
$$ LANGUAGE plpgsql;