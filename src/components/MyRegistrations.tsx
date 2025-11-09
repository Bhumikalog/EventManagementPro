import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Ticket} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import QRCode from 'react-qr-code';

export default function MyRegistrations() {
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadRegistrations();
  }, [user]);

  // ✅ Fetch all user registrations with event + ticket + venue details
  const loadRegistrations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select(`
          id,
          user_id,
          event_id,
          ticket_type_id,
          registration_status,
          created_at,
          events (
            id,
            title,
            description,
            start_ts,
            venue_name,
            venue_location
          ),
          ticket_types (
            id,
            name,
            kind,
            price
          )
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRegistrations(data || []);

      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', user?.id);

      if (ordersError) throw ordersError;
      setOrders(ordersData || []);
    } catch (err) {
      console.error('Error loading registrations:', err);
      toast.error('Failed to load registrations.');
    } finally {
      setLoading(false);
    }
  };

  // ✅ Cancel registration + promote next waitlisted participant (via Edge Function)
  const handleCancel = async (registrationId: string, eventId: string) => {
    const confirmCancel = confirm('Are you sure you want to cancel this registration?');
    if (!confirmCancel) return;

    setProcessingId(registrationId);
    try {
      // 1️⃣ Get current user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('User not authenticated.');
        return;
      }

      // 2️⃣ Build Edge Function URL dynamically
      const functionUrl =
        import.meta.env.VITE_ATTENDEE_MANAGEMENT_URL ||
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/attendee-management`;
      console.log('🧩 Cancel payload:', {
      registration_id: registrationId,
      event_id: eventId,
    });

      // 3️⃣ Call Edge Function to handle cancellation + promotion
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'cancel_registration',
          registration_id: registrationId,
          event_id: eventId,
        }),
      });

      let result = {};
      try {
        result = await response.json();
      } catch {
        result = { error: 'Invalid JSON response from server.' };
      }

      console.log('Cancel/promotion response:', response.status, result);

      if (!response.ok) {
        toast.error(result['error'] || 'Server error during cancellation.');
      } else {
        if (result['promoted_id']) {
          toast.success('Registration cancelled. A waitlisted user has been promoted!');
        } else {
          toast.success('Registration cancelled successfully.');
        }
        await loadRegistrations();
      }
    } catch (err: any) {
      console.error('Cancellation error:', err);
      toast.error(err.message || 'Failed to cancel registration.');
    } finally {
      setProcessingId(null);
    }
  };

  // ✅ UI States
  if (loading) return <div className="text-center py-8">Loading your registrations...</div>;

  if (!registrations.length)
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          You haven't registered for any events yet.
        </CardContent>
      </Card>
    );

  // ✅ Render all registrations
  return (
    <div className="space-y-4">
      {registrations.map((reg) => {
        const event = reg.events;
        const ticket = reg.ticket_types;
        const order = orders.find((o) => o.registration_id === reg.id);

        return (
          <Card key={reg.id}>
            <CardHeader className="flex justify-between items-start">
              <div>
                <CardTitle>{event?.title || 'Untitled Event'}</CardTitle>
                <CardDescription>
                  <div className="flex items-center gap-2 text-sm mt-1 text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {event?.start_ts ? format(new Date(event.start_ts), 'PPp') : 'Date TBD'}
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {event?.venue_name || 'Venue TBD'}
                    {event?.venue_location ? ` - ${event.venue_location}` : ''}
                  </div>
                  {ticket && (
                    <div className="flex items-center gap-2 text-sm mt-1 text-muted-foreground">
                      <Ticket className="h-3 w-3" />
                      {ticket.name} ({ticket.kind}) — ₹{ticket.price || 0}
                    </div>
                  )}
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    reg.registration_status === 'confirmed'
                      ? 'default'
                      : reg.registration_status === 'waitlisted'
                      ? 'secondary'
                      : 'destructive'
                  }
                >
                  {reg.registration_status}
                </Badge>

                {(reg.registration_status === 'confirmed' || reg.registration_status === 'waitlisted') && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={processingId === reg.id}
                    onClick={() => {
                    console.log('Cancelling with:', {
                      regId: reg.id,
                      eventId: reg.event_id || reg.events?.id,
                    });
                    handleCancel(
                      reg.id,
                      reg.event_id || reg.events?.id
                    );
                  }}

                  >
                    Cancel
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {event?.description && (
                <p className="text-sm text-muted-foreground">{event.description}</p>
              )}

              {reg.registration_status === 'confirmed' && order?.qr_code_data && (
                <div className="flex flex-col items-center gap-2 p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium">Your Ticket QR Code</p>
                  <div className="bg-white p-4 rounded-lg">
                    <QRCode value={order.qr_code_data} size={200} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Show this QR code at the event entrance.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
