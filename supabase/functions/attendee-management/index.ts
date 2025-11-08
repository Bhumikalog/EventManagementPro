import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
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
      case 'POST': {
        const body = await req.json()
        
        if (body.action === 'waitlist') {
          let updateData: any = {}
          
          switch (body.waitlist_action) {
            case 'add_to_waitlist': {
              const { data: maxPosition } = await supabaseClient
                .from('attendees')
                .select('waitlist_position')
                .eq('is_waitlisted', true)
                .order('waitlist_position', { ascending: false })
                .limit(1)
                .maybeSingle()

              const nextPosition = maxPosition ? (maxPosition.waitlist_position || 0) + 1 : 1

              updateData = {
                is_waitlisted: true,
                waitlist_position: nextPosition,
                rsvp_status: 'pending'
              }
              break
            }
            
            case 'remove_from_waitlist': {
              updateData = {
                is_waitlisted: false,
                waitlist_position: null
              }
              break
            }
            
            case 'promote_from_waitlist': {
              updateData = {
                is_waitlisted: false,
                waitlist_position: null,
                rsvp_status: 'accepted'
              }
              break
            }
            
            default:
              return new Response(
                JSON.stringify({ error: 'Invalid waitlist action' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
          }

          const { data: attendee, error } = await supabaseClient
            .from('attendees')
            .update(updateData)
            .eq('id', body.attendee_id)
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
            JSON.stringify({ data: attendee }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      case 'GET': {
        const action = url.searchParams.get('action')
        
        if (action === 'waitlist') {
          const { data: waitlist, error } = await supabaseClient
            .from('attendees')
            .select('*')
            .eq('is_waitlisted', true)
            .order('waitlist_position', { ascending: true })

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
