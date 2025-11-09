import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function RegistrationsList() {
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRegistrations();
  }, []);

  const loadRegistrations = async () => {
    const { data, error } = await supabase
      .from('registrations')
      .select(`
        *,
        user:profiles(display_name, email),
        event:events(title, start_ts),
        ticket_type:ticket_types(name, kind)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading registrations:', error);
    } else {
      setRegistrations(data || []);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">All Registrations</h2>
        <p className="text-muted-foreground">View all event registrations</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registration History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading registrations...</div>
          ) : registrations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No registrations yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Participant</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Event Date</TableHead>
                    <TableHead>Ticket Type</TableHead>
                    <TableHead>Registration Status</TableHead>
                    <TableHead>Check-In</TableHead>
                    <TableHead>Registered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registrations.map((reg) => (
                    <TableRow key={reg.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{reg.user?.display_name}</span>
                          <span className="text-xs text-muted-foreground">{reg.user?.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>{reg.event?.title}</TableCell>
                      <TableCell>
                        {reg.event?.start_ts && format(new Date(reg.event.start_ts), 'PPp')}
                      </TableCell>
                      <TableCell>{reg.ticket_type?.name}</TableCell>
                      <TableCell>
                        <Badge variant={reg.registration_status === 'confirmed' ? 'default' : 'secondary'}>
                          {reg.registration_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {reg.checked_in_at ? (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            {format(new Date(reg.checked_in_at), 'Pp')}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {format(new Date(reg.created_at), 'PP')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
