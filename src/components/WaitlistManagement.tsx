import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWaitlist } from '@/hooks/useWaitlist';
import { supabase } from '@/integrations/supabase/client';

export const WaitlistManagement = () => {
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [events, setEvents] = useState<any[]>([]);
  const { waitlist, loading, promoteFromWaitlist, removeFromWaitlist } = useWaitlist({ eventId: selectedEventId });

  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from('events')
        .select('id, title')
        .order('start_ts', { ascending: false });
      
      if (data && data.length > 0) {
        setEvents(data);
        setSelectedEventId(data[0].id);
      }
    };
    fetchEvents();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Waitlist Management ({waitlist.length})</CardTitle>
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {waitlist.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No one on the waitlist for this event.</p>
          ) : (
            waitlist.map((registration, index) => (
              <div key={registration.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary">Position #{index + 1}</Badge>
                    <h3 className="font-medium">{registration.profiles?.display_name || 'Unknown'}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{registration.profiles?.email}</p>
                  <p className="text-sm text-muted-foreground">{registration.ticket_types?.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Waitlisted: {new Date(registration.created_at).toLocaleDateString()} at{' '}
                    {new Date(registration.created_at).toLocaleTimeString()}
                  </p>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => promoteFromWaitlist(registration.id)}
                    disabled={loading}
                  >
                    <span className="w-4 h-4 mr-1">➕</span>
                    Promote
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => removeFromWaitlist(registration.id)}
                    disabled={loading}
                  >
                    <span className="w-4 h-4 mr-1">❌</span>
                    Remove
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
