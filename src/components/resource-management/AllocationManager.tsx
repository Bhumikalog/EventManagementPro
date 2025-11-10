import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Trash2, Plus } from 'lucide-react';

interface Resource {
  id: string;
  name: string;
  type: string;
  capacity: number;
  location: string;
  status: string;
}

interface Event {
  id: string;
  title: string;
  start_ts: string;
}

interface Allocation {
  id: string;
  notes: string;
  allocated_at: string;
  resources: { name: string; type: string } | null;
  events: { title: string } | null;
}

export function AllocationManager() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [selectedResource, setSelectedResource] = useState('');
  const [selectedEvent, setSelectedEvent] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  // subscribe to realtime updates so allocations list stays in sync when resources are allocated elsewhere
  useEffect(() => {
    const channel = (supabase as any).channel('public:allocations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resource_allocations' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' }, () => loadData())
      .subscribe();

    return () => {
      try {
        (supabase as any).removeChannel(channel);
      } catch (e) {
        // ignore
      }
    };
  }, []);

  const loadData = async () => {
    try {
      // Load available resources
      const { data: resourcesData, error: resError } = await (supabase as any)
        .from('resources')
        .select('*')
        .eq('status', 'available')
        .order('name');

      if (resError) throw resError;

      // Events for the organizer
      const { data: { user } } = await supabase.auth.getUser();
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('id, title, start_ts')
        .eq('organizer_id', user?.id)
        .order('start_ts');

      if (eventsError) throw eventsError;

      // Allocations for organizer
      const { data: allocationsData, error: allocError } = await (supabase as any)
        .from('resource_allocations')
        .select(`
          id,
          notes,
          allocated_at,
          resources(name, type),
          events(title)
        `)
        .order('allocated_at', { ascending: false });

      if (allocError) throw allocError;

      setResources(resourcesData || []);
      setEvents(eventsData || []);
      setAllocations(allocationsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handleAllocate = async () => {
    if (!selectedResource || !selectedEvent) {
      toast({
        title: 'Error',
        description: 'Please select both resource and event',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await (supabase as any)
        .from('resource_allocations')
        .insert({
          resource_id: selectedResource,
          event_id: selectedEvent,
          organizer_id: user.id,
          notes
        });

      if (error) throw error;

      // mark resource as allocated
      const { error: resErr } = await supabase
        .from('resources')
        .update({ status: 'allocated', allocated_to: selectedEvent })
        .eq('id', selectedResource);

      if (resErr) console.warn('Failed to update resource status after allocation:', resErr.message || resErr);

      toast({
        title: 'Success',
        description: 'Resource allocated successfully'
      });

      setSelectedResource('');
      setSelectedEvent('');
      setNotes('');
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {

      // find allocation to get resource id
      const { data: alloc } = await (supabase as any)
        .from('resource_allocations')
        .select('resource_id')
        .eq('id', id)
        .single();

      const resourceId = alloc?.resource_id;

      const { error } = await supabase
        .from('resource_allocations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // reset resource status to available
      if (resourceId) {
        const { error: resErr } = await (supabase as any)
          .from('resources')
          .update({ status: 'available', allocated_to: null })
          .eq('id', resourceId);

        if (resErr) console.warn('Failed to reset resource status after deletion:', resErr.message || resErr);
      }

      toast({
        title: 'Success',
        description: 'Allocation removed successfully'
      });

      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Your Resource Allocations ({allocations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {allocations.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No allocations yet.</p>
          ) : (
            <div className="space-y-4">
              {allocations.map((allocation) => (
                <div key={allocation.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <h3 className="font-medium">{allocation.resources?.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Type: {allocation.resources?.type}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Event: {allocation.events?.title}
                    </p>
                    {allocation.notes && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Notes: {allocation.notes}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Allocated: {new Date(allocation.allocated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(allocation.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
