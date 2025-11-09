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
  // This list will be loaded from our new function
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadMyRegistrations();
  }, [user]);

  // Switched to use supabase.rpc() to call the function we just made
  const loadMyRegistrations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_registrations');

      if (error) {
        console.error("Supabase RPC error:", error);
        throw error;
      }
      
      setRegistrations(data || []);
      
    } catch (err) {
      console.error('Error loading registrations:', err);
      toast.error('Failed to load registrations. Did you run the new database migration?');
    } finally {
      setLoading(false);
    }
  };

  // ✅ Cancel registration + promote next waitlisted participant (via Edge Function)
  const handleCancel = async (registrationId: string, ticketTypeId: string, eventId: string) => {
    const confirmCancel = confirm('Are you sure you want to cancel this registration?');
    if (!confirmCancel) return;

    setProcessingId(registration.order_id); // Use order ID for processing state
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('User not authenticated.');
        return;
      }
      
      const functionUrl =
        import.meta.env.VITE_ATTENDEE_MANAGEMENT_URL ||
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/attendee-management`;
      console.log('🧩 Cancel payload:', {
      registration_id: registrationId,
      event_id: eventId,
    });

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
          ticket_type_id: ticketTypeId,
        }),
      });

      let result = {};
      try {
        result = await response.json();
      } catch {
        result = { error: 'Invalid JSON response from server.' };
      }

      if (!response.ok) {
        toast.error(result['error'] || 'Server error during cancellation.');
      } else {
        toast.success('Registration cancelled successfully.');
        await loadMyRegistrations(); // Refresh the list
      }
    } catch (err: any) {
      console.error('Cancellation error:', err);
      toast.error(err.message || 'Failed to cancel registration.');
    } finally {
      setProcessingId(null);
    }
  };

  // UI States
  if (loading) return <div className="text-center py-8">Loading your registrations...</div>;

  if (!registrations.length)
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          You haven't registered for any events yet.
        </CardContent>
      </Card>
    );

  // Render all registrations
  return (
    <div className="space-y-4">
      {registrations.map((reg) => {
        
        let status = reg.registration_status;
        
        if (status === 'cancelled') {
           return null; // Don't show cancelled orders
        }

        if (!status) {
          status = 'confirmed';
        }

        return (
          <Card key={reg.order_id}>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>{reg.event_title || 'Untitled Event'}</CardTitle>
                <CardDescription className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {reg.event_start_ts ? format(new Date(reg.event_start_ts), 'PPp') : 'Date TBD'}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {reg.event_venue_name || 'Venue TBD'}
                    {reg.event_venue_location ? ` - ${reg.event_venue_location}` : ''}
                  </div>
                  {reg.ticket_name && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Ticket className="h-3 w-3" />
                      {reg.ticket_name} ({reg.ticket_kind}) — ₹{reg.ticket_price || 0}
                    </div>
                  )}
                </CardDescription>
              </div>

              <div className="flex flex-col items-end gap-2">
                <Badge
                  variant={
                    status === 'confirmed'
                      ? 'default'
                      : status === 'waitlisted'
                      ? 'secondary'
                      : 'destructive'
                  }
                >
                  {status}
                </Badge>

                {(status === 'confirmed' || status === 'waitlisted') && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={processingId === reg.id}
                    onClick={() => handleCancel(reg.id, reg.ticket_type_id, reg.event_id)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {reg.event_description && (
                <p className="text-sm text-muted-foreground">{reg.event_description}</p>
              )}

              {status === 'confirmed' && reg.qr_code_data && (
                <div className="flex flex-col items-center gap-2 p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium">Your Ticket QR Code</p>
                  <div className="bg-white p-4 rounded-lg">
                    <QRCode value={reg.qr_code_data} size={200} />
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