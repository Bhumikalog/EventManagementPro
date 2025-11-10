import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header.' }),
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

    // -----------------------------------------------------
    // POST — Handle all actions (registration, waitlist, check-in)
    // -----------------------------------------------------
    if (req.method === 'POST') {
      const body = await req.json()

      // ✅ ACTION 1: Create Registration
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

      // ✅ ACTION 2: Waitlist Management
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

      // ✅ ACTION 3: QR Check-In System
      if (body.action === 'checkin') {
        const qrData = body.qr_data
        if (!qrData) {
          return new Response(
            JSON.stringify({ error: 'Missing QR data.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        let uniqueId
        try {
          const payload = JSON.parse(qrData)
          uniqueId = payload.order_id
        } catch {
          uniqueId = qrData
        }

        // Validate registration
        let { data: registration } = await supabaseClient
          .from('registrations')
          .select('id, user_id, event_id, registration_status, checked_in_at')
          .eq('id', uniqueId)
          .maybeSingle()

        // Try resolving via orders table if not found
        if (!registration) {
          const { data: order } = await supabaseClient
            .from('orders')
            .select('registration_id')
            .eq('id', uniqueId)
            .maybeSingle()
          if (order?.registration_id) {
            const { data: reg } = await supabaseClient
              .from('registrations')
              .select('id, user_id, event_id, registration_status, checked_in_at')
              .eq('id', order.registration_id)
              .maybeSingle()
            registration = reg
          }
        }

        if (!registration || registration.registration_status !== 'confirmed') {
          return new Response(
            JSON.stringify({ error: 'Invalid or unconfirmed registration.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Already checked in?
        if (registration.checked_in_at) {
          return new Response(
            JSON.stringify({
              message: 'Already checked in',
              checked_in_at: registration.checked_in_at
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Get resource allocation for this event
        const { data: allocation } = await supabaseClient
          .from('resource_allocations')
          .select('resource_id')
          .eq('event_id', registration.event_id)
          .maybeSingle()
        const resourceId = allocation?.resource_id || null

        // Update registration (checked_in_at)
        const now = new Date().toISOString()
        await supabaseClient
          .from('registrations')
          .update({ checked_in_at: now })
          .eq('id', registration.id)

        // Insert record into checkins table
        const { error: checkinError } = await supabaseClient
          .from('checkins')
          .insert({
            participant_id: registration.user_id,
            resource_id: resourceId,
            event_id: registration.event_id,
            status: 'checked_in'
          })

        if (checkinError) {
          console.error('Check-in insert error:', checkinError)
          return new Response(
            JSON.stringify({ error: 'Failed to record check-in' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({
            message: 'Check-in successful',
            registration_id: registration.id,
            event_id: registration.event_id,
            checked_in_at: now
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // ❌ Invalid POST action
      return new Response(
        JSON.stringify({ error: 'Invalid action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // -----------------------------------------------------
    // GET — Waitlist or stats
    // -----------------------------------------------------
    if (req.method === 'GET') {
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

      return new Response(
        JSON.stringify({ error: 'Invalid GET action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // -----------------------------------------------------
    // Fallback
    // -----------------------------------------------------
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
