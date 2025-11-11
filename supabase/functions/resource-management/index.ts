// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'No authorization header'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Invalid token'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // check role in profiles
    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile || profile.role !== 'organizer') {
      return new Response(JSON.stringify({
        error: 'Forbidden: organizer role required'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const url = new URL(req.url);
    // ------------------------
    // GET REQUESTS
    // ------------------------
    if (req.method === 'GET') {
      const action = url.searchParams.get('action');
      // Fetch resources (available + allocated)
      if (action === 'resources') {
        const { data, error } = await supabaseClient.from('resources').select('*').order('name');
        if (error) {
          return new Response(JSON.stringify({
            error: error.message
          }), {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
        return new Response(JSON.stringify({
          data
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      // Fetch resource allocations for this organizer
      if (action === 'allocations') {
        const { data, error } = await supabaseClient.from('resource_allocations').select(`
            id,
            notes,
            allocated_at,
            resources(*),
            events(*)
          `).eq('organizer_id', user.id).order('allocated_at', {
          ascending: false
        });
        if (error) {
          return new Response(JSON.stringify({
            error: error.message
          }), {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
        return new Response(JSON.stringify({
          data
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      return new Response(JSON.stringify({
        error: 'Invalid action'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ------------------------
    // POST REQUESTS
    // ------------------------
    if (req.method === 'POST') {
      const body = await req.json();
      switch(body.action){
        // Create new resource
        case 'create_resource':
          {
            const { data, error } = await supabaseClient.from('resources').insert(body.data).select();
            if (error) return new Response(JSON.stringify({
              error: error.message
            }), {
              status: 400,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
            return new Response(JSON.stringify({
              data
            }), {
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
          }
        // Update existing resource
        case 'update_resource':
          {
            const { data, error } = await supabaseClient.from('resources').update(body.data).eq('id', body.id).select();
            if (error) return new Response(JSON.stringify({
              error: error.message
            }), {
              status: 400,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
            return new Response(JSON.stringify({
              data
            }), {
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
          }
        // Delete a resource
        case 'delete_resource':
          {
            const { data, error } = await supabaseClient.from('resources').delete().eq('id', body.id).select();
            if (error) return new Response(JSON.stringify({
              error: error.message
            }), {
              status: 400,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
            return new Response(JSON.stringify({
              data
            }), {
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
          }
        // Allocate resource to an event (insert + update)
        case 'allocate_resource':
          {
            const insertData = {
              resource_id: body.resource_id,
              event_id: body.event_id,
              organizer_id: user.id,
              notes: body.notes || null
            };
            // Insert allocation
            const { data, error } = await supabaseClient.from('resource_allocations').insert(insertData).select();
            if (error) return new Response(JSON.stringify({
              error: error.message
            }), {
              status: 400,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
            // Update resource status → allocated
            const { error: updateError } = await supabaseClient.from('resources').update({
              status: 'allocated'
            }).eq('id', body.resource_id);
            if (updateError) return new Response(JSON.stringify({
              error: updateError.message
            }), {
              status: 400,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
            return new Response(JSON.stringify({
              data
            }), {
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
          }
        // Delete allocation and mark resource as available again
        case 'delete_allocation':
          {
            // Fetch resource_id before deleting
            const { data: alloc } = await supabaseClient.from('resource_allocations').select('resource_id').eq('id', body.id).maybeSingle();
            // Delete allocation
            const { error } = await supabaseClient.from('resource_allocations').delete().eq('id', body.id);
            if (error) return new Response(JSON.stringify({
              error: error.message
            }), {
              status: 400,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
            // Mark resource as available again
            if (alloc?.resource_id) {
              await supabaseClient.from('resources').update({
                status: 'available'
              }).eq('id', alloc.resource_id);
            }
            return new Response(JSON.stringify({
              success: true
            }), {
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
          }
        // Record check-ins
        case 'record_checkin':
          {
            const insertData = {
              participant_id: body.participant_id,
              resource_id: body.resource_id || null,
              event_id: body.event_id || null,
              timestamp: body.timestamp || new Date().toISOString(),
              status: body.status || 'checked_in'
            };
            const { data, error } = await supabaseClient.from('checkins').insert(insertData).select();
            if (error) return new Response(JSON.stringify({
              error: error.message
            }), {
              status: 400,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
            return new Response(JSON.stringify({
              data
            }), {
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
          }
        default:
          return new Response(JSON.stringify({
            error: 'Invalid action'
          }), {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
      }
    }
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
