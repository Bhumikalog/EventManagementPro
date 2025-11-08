import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Ticket, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import QRCode from 'react-qr-code';

export default function MyRegistrations() {
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadRegistrations();
    }
  }, [user]);

  const loadRegistrations = async () => {
    const { data, error } = await supabase
      .from('registrations')
      .select(`
        *,
        event:events(*),
        ticket_type:ticket_types(*)
      `)
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading registrations:', error);
    } else {
      setRegistrations(data || []);
    }

    // Load orders with QR codes
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', user?.id);

    if (ordersError) {
      console.error('Error loading orders:', ordersError);
    } else {
      setOrders(ordersData || []);
    }

    setLoading(false);
  };

  const handleCancel = async (registrationId: string, ticketTypeId: string) => {
    if (!confirm('Are you sure you want to cancel this registration?')) return;

    try {
      const { error } = await supabase
        .from('registrations')
        .update({ status: 'cancelled' })
        .eq('id', registrationId);

      if (error) throw error;

      // Decrement sold count
      await supabase.rpc('decrement_ticket_sold_count', { ticket_id: ticketTypeId });

      toast.success('Registration cancelled');
      loadRegistrations();
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel registration');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading your registrations...</div>;
  }

  if (registrations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">You haven't registered for any events yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {registrations.map((reg) => {
        const order = orders.find(o => o.registration_id === reg.id);
        
        return (
          <Card key={reg.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <CardTitle>{reg.event?.title}</CardTitle>
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(reg.event?.start_ts), 'PPp')}
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {reg.event?.venue_name}
                      {reg.event?.venue_location && ` - ${reg.event.venue_location}`}
                    </div>
                    <div className="flex items-center gap-1">
                      <Ticket className="h-3 w-3" />
                      {reg.ticket_type?.name} - {reg.ticket_type?.kind}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={reg.status === 'confirmed' ? 'default' : 'secondary'}>
                    {reg.status}
                  </Badge>
                  {reg.status === 'confirmed' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCancel(reg.id, reg.ticket_type_id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {reg.event?.description && (
                <p className="text-sm text-muted-foreground">{reg.event.description}</p>
              )}
              
              {reg.status === 'confirmed' && order?.qr_code_data && (
                <div className="flex flex-col items-center gap-2 p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium">Your Ticket QR Code</p>
                  <div className="bg-white p-4 rounded-lg">
                    <QRCode value={order.qr_code_data} size={200} />
                  </div>
                  <p className="text-xs text-muted-foreground">Show this at the event entrance</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
