import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CreditCard, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { RazorpayOrderResponse, RazorpaySuccessResponse } from '@/types/payment'

export default function Payment() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { event, ticketType } = location.state || {}

  useEffect(() => {
    if (!event || !ticketType) {
      toast.error('Invalid payment request')
      navigate('/')
    }
  }, [event, ticketType, navigate])

  useEffect(() => {
    // Load Razorpay script
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  const handlePayment = async () => {
    if (!user || !event || !ticketType) return

    setLoading(true)
    setError(null)

    try {
      // Create Razorpay order
      const { data: session } = await supabase.auth.getSession()
      let response: any
      try {
        response = await supabase.functions.invoke('create-razorpay-order', {
          body: {
            event_id: event.id,
            ticket_type_id: ticketType.id,
            amount: ticketType.price
          },
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`
          }
        })

        if (response.error) {
          throw response.error
        }
      } catch (invokeErr) {
        // Fallback: try direct fetch to the Functions REST endpoint (useful in local/dev setups)
        console.warn('functions.invoke failed, attempting direct fetch fallback:', invokeErr)
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
          const fnUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/create-razorpay-order`
          const fetchRes = await fetch(fnUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // include Authorization when available so the function can validate the user
              ...(session.session?.access_token ? { Authorization: `Bearer ${session.session?.access_token}` } : {}),
              // include the anon key as apikey header as the functions endpoint may require it
              ...(anonKey ? { apikey: anonKey } : {})
            },
            body: JSON.stringify({ event_id: event.id, ticket_type_id: ticketType.id, amount: ticketType.price })
          })

          if (!fetchRes.ok) {
            const txt = await fetchRes.text()
            throw new Error(`Function fetch failed: ${fetchRes.status} ${txt}`)
          }

          response = await fetchRes.json()
          // Normalize to SDK-like shape
          response = { data: response }
        } catch (fetchErr) {
          console.error('Direct function fetch also failed:', fetchErr)
          throw fetchErr
        }
      }

      const orderData: RazorpayOrderResponse = response.data

      // Open Razorpay checkout
      const options = {
        key: orderData.key_id,
        amount: orderData.amount,
        currency: orderData.currency,
        name: event.title,
        description: ticketType.name,
        order_id: orderData.razorpay_order_id,
        handler: async (razorpayResponse: RazorpaySuccessResponse) => {
          await verifyPayment(orderData.order_id, razorpayResponse)
        },
        prefill: {
          name: profile?.display_name || '',
          email: user.email || '',
        },
        theme: {
          color: '#3b82f6'
        },
        modal: {
          ondismiss: () => {
            setLoading(false)
            setError('Payment cancelled')
          }
        }
      }

      const razorpay = new window.Razorpay(options)
      razorpay.open()

      razorpay.on('payment.failed', (response: any) => {
        console.error('Payment failed:', response.error)
        setError('Payment failed. Please try again.')
        setLoading(false)
      })
    } catch (err: any) {
      console.error('Payment error:', err)
      // Provide a clearer message for network/function unreachable errors
      const msg = String(err?.message || err)
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Function fetch failed')) {
        setError('Failed to reach the Edge Function. Ensure the function is deployed or run locally (see console for details).')
      } else {
        setError(msg || 'Failed to initiate payment')
      }
      setLoading(false)
    }
  }

  const verifyPayment = async (orderId: string, razorpayResponse: RazorpaySuccessResponse) => {
    try {
      const { data: session } = await supabase.auth.getSession()
      let response: any
      try {
        response = await supabase.functions.invoke('verify-payment', {
          body: {
            order_id: orderId,
            razorpay_payment_id: razorpayResponse.razorpay_payment_id,
            razorpay_order_id: razorpayResponse.razorpay_order_id,
            razorpay_signature: razorpayResponse.razorpay_signature
          },
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`
          }
        })

        if (response.error) {
          throw response.error
        }
      } catch (invokeErr) {
        console.warn('verify-payment invoke failed, attempting direct fetch fallback:', invokeErr)
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string
          const fnUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/verify-payment`
          const fetchRes = await fetch(fnUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session.session?.access_token ? { Authorization: `Bearer ${session.session?.access_token}` } : {}),
              ...(anonKey ? { apikey: anonKey } : {})
            },
            body: JSON.stringify({ order_id: orderId, razorpay_payment_id: razorpayResponse.razorpay_payment_id, razorpay_order_id: razorpayResponse.razorpay_order_id, razorpay_signature: razorpayResponse.razorpay_signature })
          })

          if (!fetchRes.ok) {
            const txt = await fetchRes.text()
            throw new Error(`Function fetch failed: ${fetchRes.status} ${txt}`)
          }

          response = await fetchRes.json()
          response = { data: response }
        } catch (fetchErr) {
          console.error('Direct verify function fetch also failed:', fetchErr)
          throw fetchErr
        }
      }

      toast.success('Payment successful!')
      navigate('/ticket-success', {
        state: {
          orderId: response.data.order_id,
          qrCodeData: response.data.qr_code_data
        }
      })
    } catch (err: any) {
      console.error('Verification error:', err)
      const msg = String(err?.message || err)
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Function fetch failed')) {
        setError('Failed to reach the Edge Function (verify). Ensure the function is deployed or run locally. See console for details.')
      } else {
        setError(msg || 'Payment verification failed')
      }
      setLoading(false)
    }
  }

  if (!event || !ticketType) {
    return null
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Complete Payment
          </CardTitle>
          <CardDescription>
            Secure payment for your event ticket
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Event:</span>
              <span className="text-sm font-medium">{event.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Ticket Type:</span>
              <span className="text-sm font-medium">{ticketType.name}</span>
            </div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between">
                <span className="font-medium">Total Amount:</span>
                <span className="font-bold text-lg">₹{ticketType.price}</span>
              </div>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={handlePayment}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Pay Now'
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate('/')}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Secured by Razorpay • Your payment information is encrypted
          </p>
        </CardContent>
      </Card>
    </div>
  )
}