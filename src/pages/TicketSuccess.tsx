import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Download, Home, Loader2 } from 'lucide-react'
import QRCode from 'react-qr-code'

export default function TicketSuccess() {
  const navigate = useNavigate()
  const location = useLocation()
  const [orderDetails, setOrderDetails] = useState<any>(null)
  const [eventDetails, setEventDetails] = useState<any>(null)
  const [loading, setLoading] = useState(true);

  const { orderId, qrCodeData } = location.state || {}

  useEffect(() => {
    // MODIFICATION: Only navigate if orderId is missing.
    // qrCodeData can be fetched later or passed in.
    if (!orderId) {
      navigate('/')
      return
    }

    fetchOrderDetails()
  }, [orderId, navigate]) // Removed qrCodeData from deps

  const fetchOrderDetails = async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const { data: order, error } = await supabase
        .from('orders')
        .select(`
          *,
          events (
            title,
            start_ts,
            venue_name,
            venue_location
          ),
          ticket_types (
            name
          )
        `)
        .eq('id', orderId)
        .single()

      if (error) throw error

      setOrderDetails(order)
      setEventDetails(order.events)
    } catch (error) {
      console.error('Error fetching order:', error)
    } finally {
      setLoading(false);
    }
  }

  const downloadQRCode = () => {
    const svg = document.getElementById('qr-code')
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx?.drawImage(img, 0, 0)
      const pngFile = canvas.toDataURL('image/png')

      const downloadLink = document.createElement('a')
      downloadLink.download = `ticket-${orderId}.png`
      downloadLink.href = pngFile
      downloadLink.click()
    }

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }
  
  // Use orderDetails if available (for page reloads)
  const finalQrData = qrCodeData || orderDetails?.qr_code_data
  const finalEventDetails = eventDetails || orderDetails?.events
  const finalTicketDetails = orderDetails?.ticket_types

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle className="text-2xl">Payment Successful!</CardTitle>
          <CardDescription>
            Your ticket has been confirmed. Please save this QR code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Event Details */}
          <div className="space-y-2 border-b pb-4">
            <h3 className="font-semibold">Event Details</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Event:</span>
              <span className="font-medium">{finalEventDetails?.title ?? '...'}</span>
              
              <span className="text-muted-foreground">Ticket Type:</span>
              <span className="font-medium">{finalTicketDetails?.name ?? '...'}</span>
              
              <span className="text-muted-foreground">Date:</span>
              <span className="font-medium">
                {finalEventDetails?.start_ts ? new Date(finalEventDetails.start_ts).toLocaleString() : '...'}
              </span>
              
              <span className="text-muted-foreground">Venue:</span>
              <span className="font-medium">
                {finalEventDetails?.venue_name ?? '...'}
                {finalEventDetails?.venue_location && `, ${finalEventDetails.venue_location}`}
              </span>
              
              <span className="text-muted-foreground">Amount Paid:</span>
              <span className="font-medium">₹{orderDetails?.amount ?? '...'}</span>
            </div>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center space-y-4">
            <h3 className="font-semibold">Your Ticket QR Code</h3>
            {/* MODIFICATION: Check for finalQrData */}
            {finalQrData ? (
              <>
                <div className="bg-white p-6 rounded-lg">
                  <QRCode
                    id="qr-code"
                    value={finalQrData}
                    size={256}
                    level="H"
                  />
                </div>
                <p className="text-sm text-center text-muted-foreground">
                  Show this QR code at the event entrance
                </p>
              </>
            ) : (
              // This message is shown if QR data is missing
              <div className="text-center p-6">
                <p className="text-muted-foreground">QR Code is being generated. Please check "My Registrations" shortly.</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={downloadQRCode}
              disabled={!finalQrData} // Disable if no QR
            >
              <Download className="mr-2 h-4 w-4" />
              Download QR Code
            </Button>
            <Button
              className="flex-1"
              onClick={() => navigate('/')}
            >
              <Home className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            A confirmation email has been sent to your registered email address
          </p>
        </CardContent>
      </Card>
    </div>
  )
}