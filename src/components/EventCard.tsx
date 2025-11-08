import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, Users, Ticket } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface EventCardProps {
  event: any;
  onRegister: () => void;
}

export default function EventCard({ event, onRegister }: EventCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [registering, setRegistering] = useState(false);

  const handleRegister = async (ticketType: any) => {
    if (!user) {
      toast.error('Please sign in to register');
      return;
    }

    // Check if already registered (only confirmed registrations)
    // Use maybeSingle to avoid throwing when not found and to be tolerant of different REST responses
    const { data: existing } = await supabase
      .from('registrations')
      .select('id')
      .eq('user_id', user.id)
      .eq('event_id', event.id)
      .eq('ticket_type_id', ticketType.id)
      .eq('status', 'confirmed')
      .maybeSingle();

    if (existing) {
      toast.error('You are already registered for this event');
      return;
    }

    // If paid ticket, navigate to payment page
    if (ticketType.kind === 'paid' && ticketType.price > 0) {
      navigate('/payment', {
        state: {
          event,
          ticketType
        }
      });
      return;
    }

    // For free tickets, register directly
    setRegistering(true);
    try {
      // Check if event is at capacity
      const confirmedCount = await supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('status', 'confirmed');

      const isAtCapacity = ticketType.capacity && confirmedCount.count >= ticketType.capacity;
      
      // Create registration first
      const { data: registration, error: regError } = await supabase
        .from('registrations')
        .insert({
          user_id: user.id,
          event_id: event.id,
          ticket_type_id: ticketType.id,
          status: isAtCapacity ? 'waitlisted' : 'confirmed'
        })
        .select()
        .single();

      if (regError) throw regError;

      // Generate QR code data
      const qrCodeData = JSON.stringify({
        order_id: registration.id,
        event_id: event.id,
        user_id: user.id,
        ticket_type_id: ticketType.id,
        timestamp: new Date().toISOString()
      });

      // Create order with QR code for free ticket
      const { error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          event_id: event.id,
          ticket_type_id: ticketType.id,
          registration_id: registration.id,
          amount: 0,
          currency: 'INR',
          payment_status: 'completed',
          qr_code_data: qrCodeData
        });

      if (orderError) {
        console.error('Order creation error:', orderError);
        throw orderError;
      }

      // Increment ticket sold count
      await supabase.rpc('increment_ticket_sold_count', { ticket_id: ticketType.id });

      if (isAtCapacity) {
        toast.success('Event is full. You have been added to the waitlist!');
      } else {
        toast.success('Successfully registered for event!');
      }
      onRegister();
    } catch (error: any) {
      toast.error(error.message || 'Failed to register');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{event.title}</CardTitle>
        <CardDescription className="space-y-1">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(new Date(event.start_ts), 'PPp')}
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {event.venue_name}
            {event.venue_location && ` - ${event.venue_location}`}
          </div>
          {event.capacity && (
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              Capacity: {event.capacity}
            </div>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {event.description && (
          <p className="text-sm text-muted-foreground mb-4">{event.description}</p>
        )}
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Ticket className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Available Tickets</span>
          </div>
          
          {event.ticket_types?.map((ticket: any) => (
            <div
              key={ticket.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{ticket.name}</span>
                  <Badge variant={ticket.kind === 'free' ? 'secondary' : 'default'}>
                    {ticket.kind}
                  </Badge>
                </div>
                {ticket.price > 0 && (
                  <span className="text-sm text-muted-foreground">₹{ticket.price}</span>
                )}
              </div>
              <Button
                size="sm"
                onClick={() => handleRegister(ticket)}
                disabled={registering}
              >
                {ticket.kind === 'paid' ? 'Buy Ticket' : 'Register'}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
