import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function EventCheckIn() {
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      loadRegistrations();
    }
  }, [selectedEventId]);

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, start_ts')
      .order('start_ts', { ascending: true });

    if (error) {
      console.error('Error loading events:', error);
      toast.error('Failed to load events');
    } else {
      setEvents(data || []);
    }
  };

  const loadRegistrations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('registrations')
      .select(`
        *,
        user:profiles(display_name, email),
        ticket_type:ticket_types(name, kind)
      `)
      .eq('event_id', selectedEventId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading registrations:', error);
      toast.error('Failed to load registrations');
    } else {
      setRegistrations(data || []);
    }
    setLoading(false);
  };

  const handleCheckIn = async (registrationId: string) => {
    // Mark registration as checked in
    const { error: updateError } = await supabase
      .from('registrations')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('id', registrationId);

    if (updateError) {
      console.error('Error checking in:', updateError);
      toast.error('Failed to check in attendee');
      return;
    }

    toast.success('Attendee checked in successfully!');
    loadRegistrations();
  };

  const filteredRegistrations = registrations.filter((reg) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      reg.user?.display_name?.toLowerCase().includes(searchLower) ||
      reg.user?.email?.toLowerCase().includes(searchLower) ||
      reg.ticket_type?.name?.toLowerCase().includes(searchLower)
    );
  });

  const stats = {
    total: filteredRegistrations.length,
    checkedIn: filteredRegistrations.filter(r => r.checked_in_at).length,
    pending: filteredRegistrations.filter(r => !r.checked_in_at).length,
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Event Check-In</h2>
        <p className="text-muted-foreground">Check in attendees at your events</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium mb-2 block">Select Event</label>
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.title} - {format(new Date(event.start_ts), 'PP')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedEventId && (
          <div>
            <label className="text-sm font-medium mb-2 block">Search Attendees</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground">🔍</span>
              <Input
                placeholder="Search by name, email, or ticket type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        )}
      </div>

      {selectedEventId && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Registrations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Checked In
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.checkedIn}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{stats.pending}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Attendee List</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading attendees...</div>
              ) : filteredRegistrations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No registrations found
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Attendee</TableHead>
                        <TableHead>Ticket Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Check-In Time</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRegistrations.map((reg) => (
                        <TableRow key={reg.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{reg.user?.display_name}</span>
                              <span className="text-xs text-muted-foreground">{reg.user?.email}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={reg.ticket_type?.kind === 'free' ? 'secondary' : 'default'}>
                              {reg.ticket_type?.name}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={reg.status === 'confirmed' ? 'default' : 'secondary'}>
                              {reg.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {reg.checked_in_at ? (
                              <div className="flex items-center gap-2 text-green-600">
                                <CheckCircle className="h-4 w-4" />
                                {format(new Date(reg.checked_in_at), 'PPp')}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Not checked in</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {!reg.checked_in_at && (
                              <Button
                                size="sm"
                                onClick={() => handleCheckIn(reg.id)}
                              >
                                Check In
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
