import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    // Return 204 No Content with CORS headers for a clean preflight response
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    // Debug log for Authorization header
    console.log('Authorization header:', authHeader)
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header. Make sure you are signed in and sending a valid Bearer token.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const url = new URL(req.url)

    switch (req.method) {
      // -----------------------------------------------------
      // POST — Handles registration + waitlist actions
      // -----------------------------------------------------
      case 'POST': {
        const body = await req.json()

        // ✅ Create registration
        if (body.action === 'create_registration') {
          const { event_id, user_id, ticket_type_id } = body
          if (!event_id || !user_id || !ticket_type_id) {
            return new Response(
              JSON.stringify({ error: 'Missing required fields.' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const { data: eventData, error: eventError } = await supabaseClient
            .from('events')
            .select('capacity, override_capacity, venue_id')
            .eq('id', event_id)
            .single()
          if (eventError || !eventData) {
            return new Response(
              JSON.stringify({ error: 'Could not find event.' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          // Fetch venue capacity if exists
          let venueCapacity = null
          if (eventData.venue_id) {
            const { data: venueData, error: venueError } = await supabaseClient
              .from('venues')
              .select('capacity')
              .eq('id', eventData.venue_id)
              .single()
            if (!venueError && venueData) venueCapacity = venueData.capacity
          }

          // Count confirmed registrations
          const { count: confirmedCount, error: countError } = await supabaseClient
            .from('registrations')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event_id)
            .eq('registration_status', 'confirmed')
          if (countError) {
            return new Response(
              JSON.stringify({ error: 'Could not count confirmed registrations.' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          // Determine capacity
          let effectiveCapacity = eventData.capacity
          if (venueCapacity !== null && venueCapacity < effectiveCapacity) {
            effectiveCapacity = venueCapacity
          }

          let registration_status = 'confirmed'
          if (
            effectiveCapacity !== null &&
            confirmedCount >= effectiveCapacity &&
            !eventData.override_capacity
          ) {
            registration_status = 'waitlisted'
          }

          const { data: registration, error: regError } = await supabaseClient
            .from('registrations')
            .insert({
              event_id,
              user_id,
              ticket_type_id,
              registration_status
            })
            .select()
            .single()

          if (regError) {
            return new Response(
              JSON.stringify({ error: regError.message }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify({ data: registration }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // ✅ Waitlist actions
        if (body.action === 'waitlist') {
          let updateData: any = {}

          switch (body.waitlist_action) {
            case 'add_to_waitlist':
              updateData = { registration_status: 'waitlisted' }
              break
            case 'remove_from_waitlist':
              updateData = { registration_status: 'cancelled' }
              break
            case 'promote_from_waitlist':
              updateData = { registration_status: 'confirmed' }
              break
            default:
              return new Response(
                JSON.stringify({ error: 'Invalid waitlist action' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
          }

          const { data: registration, error } = await supabaseClient
            .from('registrations')
            .update(updateData)
            .eq('id', body.registration_id)
            .select()
            .single()

          if (error) {
            console.error('Waitlist management error:', error)
            return new Response(
              JSON.stringify({ error: error.message }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify({ data: registration }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Invalid POST action
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // -----------------------------------------------------
      // GET — Waitlist or stats
      // -----------------------------------------------------
      case 'GET': {
        const action = url.searchParams.get('action')

        if (action === 'waitlist') {
          const eventId = url.searchParams.get('eventId')
          let query = supabaseClient
            .from('registrations')
            .select(
              `*, 
              profiles!registrations_user_id_fkey(email, display_name), 
              events!registrations_event_id_fkey(title), 
              ticket_types!registrations_ticket_type_id_fkey(name)`
            )
            .eq('registration_status', 'waitlisted')
            .order('created_at', { ascending: true })
          if (eventId) query = query.eq('event_id', eventId)

          const { data: waitlist, error } = await query
          if (error) {
            console.error('Fetch waitlist error:', error)
            return new Response(
              JSON.stringify({ error: error.message }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          return new Response(
            JSON.stringify({ data: waitlist }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (action === 'stats') {
          const { count: totalAttendees } = await supabaseClient
            .from('attendees')
            .select('*', { count: 'exact', head: true })
          const { count: acceptedCount } = await supabaseClient
            .from('attendees')
            .select('*', { count: 'exact', head: true })
            .eq('rsvp_status', 'accepted')
          const { count: pendingCount } = await supabaseClient
            .from('attendees')
            .select('*', { count: 'exact', head: true })
            .eq('rsvp_status', 'pending')
          const { count: declinedCount } = await supabaseClient
            .from('attendees')
            .select('*', { count: 'exact', head: true })
            .eq('rsvp_status', 'declined')
          const { count: waitlistCount } = await supabaseClient
            .from('attendees')
            .select('*', { count: 'exact', head: true })
            .eq('is_waitlisted', true)

          const stats = {
            total_attendees: totalAttendees || 0,
            accepted: acceptedCount || 0,
            pending: pendingCount || 0,
            declined: declinedCount || 0,
            waitlisted: waitlistCount || 0
          }

          return new Response(
            JSON.stringify({ data: stats }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // -----------------------------------------------------
      // Fallback
      // -----------------------------------------------------
      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
