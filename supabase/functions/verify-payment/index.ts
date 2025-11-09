import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET')

interface VerifyPaymentRequest {
  order_id: string
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

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
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const {
      order_id,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature
    }: VerifyPaymentRequest = await req.json()

    // Verify signature
    const encoder = new TextEncoder()
    const data = encoder.encode(`${razorpay_order_id}|${razorpay_payment_id}`)
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(RAZORPAY_KEY_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', key, data)
    const generatedSignature = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    if (generatedSignature !== razorpay_signature) {
      console.error('Signature verification failed')
      
      // Update order as failed
      await supabaseClient
        .from('orders')
        .update({ payment_status: 'failed' })
        .eq('id', order_id)

      return new Response(
        JSON.stringify({ error: 'Payment verification failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get order details
    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single()

    if (orderError || !order) {
      console.error('Order not found:', orderError)
      throw new Error('Order not found')
    }

    // Create registration if it doesn't exist
    const { data: existingReg } = await supabaseClient
      .from('registrations')
      .select('id')
      .eq('user_id', user.id)
      .eq('event_id', order.event_id)
      .eq('ticket_type_id', order.ticket_type_id)
      .single()

    let registrationId = existingReg?.id

    if (!existingReg) {
      const { data: newReg, error: regError } = await supabaseClient
        .from('registrations')
        .insert({
          user_id: user.id,
          event_id: order.event_id,
          ticket_type_id: order.ticket_type_id,
          status: 'confirmed'
        })
        .select('id')
        .single()

      if (regError) {
        console.error('Failed to create registration:', regError)
      } else {
        registrationId = newReg.id
        
        // Increment ticket sold count
        await supabaseClient.rpc('increment_ticket_sold_count', {
          ticket_id: order.ticket_type_id
        })
      }
    }
    
    // THIS IS THE FIX: The QR data is the registration ID
    // THIS IS THE FIX: The QR data is the JSON payload
const qrData = JSON.stringify({
  order_id: order.id, // Use the order ID
  event_id: order.event_id,
  user_id: user.id,
  ticket_type_id: order.ticket_type_id,
  timestamp: new Date().toISOString()
});

    // Link registration to order
    if (registrationId) {
      await supabaseClient
        .from('orders')
        .update({ registration_id: registrationId })
        .eq('id', order_id)
    }

    // Update order with payment details
    const { error: updateError } = await supabaseClient
      .from('orders')
      .update({
        payment_status: 'completed',
        razorpay_payment_id,
        razorpay_signature,
        qr_code_data: qrData // Save the registration ID as the QR data
      })
      .eq('id', order_id)

    if (updateError) {
      console.error('Failed to update order:', updateError)
      throw new Error('Failed to update order')
    }

    console.log('Payment verified successfully:', order_id)

    return new Response(
      JSON.stringify({
        success: true,
        order_id: order.id,
        qr_code_data: qrData // Return the registration ID
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Error in verify-payment:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})