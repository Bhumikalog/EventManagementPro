import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Calendar, MapPin, Users, Trash2, X, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

type TicketType = {
  name: string;
  kind: 'free' | 'paid';
  price: number;
};

export default function EventManager({ onUpdate }: { onUpdate: () => void }) {
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([
    { name: 'Standard', kind: 'free', price: 0 }
  ]);
  const [venues, setVenues] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<string>('');
  const [selectedEquipmentEntries, setSelectedEquipmentEntries] = useState<Array<{ rowId: string; resourceId?: string; qty: number }>>([]);
  const [equipmentValidationErrors, setEquipmentValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadEvents();
    loadResourcesForForm();
  }, []);

  const loadResourcesForForm = async () => {
    // load available venues/rooms
    const { data: venuesData, error: vErr } = await (supabase as any)
      .from('resources')
      .select('*')
      .in('type', ['Venue', 'venue', 'Room', 'room'])
      .eq('status', 'available')
      .order('name');

    if (!vErr) setVenues(venuesData || []);

    // load available equipment
    const { data: equipData, error: eErr } = await (supabase as any)
      .from('resources')
      .select('*')
      .eq('type', 'Equipment')
      .eq('status', 'available')
      .order('name');

    if (!eErr) setEquipment(equipData || []);
  };

  const addEquipmentEntry = () => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setSelectedEquipmentEntries((prev) => [...prev, { rowId: id, resourceId: undefined, qty: 1 }]);
  };

  const handleEntryResourceChange = (rowId: string, resourceId: string) => {
    setSelectedEquipmentEntries((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, resourceId } : r)));
    // clear any existing error for this row when resource changes
    setEquipmentValidationErrors((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  };

  const handleEntryQtyChange = (rowId: string, value: number) => {
    setSelectedEquipmentEntries((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, qty: value } : r)));
    // validate against capacity
    const entry = selectedEquipmentEntries.find((e) => e.rowId === rowId);
    const resourceId = entry?.resourceId;
    const item = equipment.find((e) => e.id === resourceId);
    if (item) {
      if (value > (item.capacity ?? 0)) {
        setEquipmentValidationErrors((prev) => ({ ...prev, [rowId]: `Only ${item.capacity} units of ${item.name} are available.` }));
      } else {
        setEquipmentValidationErrors((prev) => {
          const next = { ...prev };
          delete next[rowId];
          return next;
        });
      }
    }
  };

  const removeEntry = (rowId: string) => {
    setSelectedEquipmentEntries((prev) => prev.filter((r) => r.rowId !== rowId));
    setEquipmentValidationErrors((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  };

  const loadEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select(`
        *,
        ticket_types(*)
      `)
      .order('start_ts', { ascending: false });

    if (error) {
      toast.error('Failed to load events');
      return;
    }

    setEvents(data || []);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    
    const startDate = formData.get('start_date') as string;
    const startTime = formData.get('start_time') as string;
    const endDate = formData.get('end_date') as string;
    const endTime = formData.get('end_time') as string;

    const start_ts = `${startDate}T${startTime}:00`;
    const end_ts = `${endDate}T${endTime}:00`;

    if (new Date(start_ts) >= new Date(end_ts)) {
      toast.error('End time must be after start time');
      setLoading(false);
      return;
    }

    try {
      const eventData = {
        title: formData.get('title') as string,
        description: formData.get('description') as string,
        venue_name: venues.find(v => v.id === selectedVenue)?.name || (formData.get('venue_name') as string),
        venue_location: venues.find(v => v.id === selectedVenue)?.location || (formData.get('venue_location') as string) || null,
        resource_id: selectedVenue || null,
        start_ts,
        end_ts,
        capacity: formData.get('capacity') ? parseInt(formData.get('capacity') as string) : null
      };

      let eventId: string;

      if (editingEvent) {
        // Update existing event
        const { error: eventError } = await supabase
          .from('events')
          .update(eventData)
          .eq('id', editingEvent.id);

        if (eventError) throw eventError;
        eventId = editingEvent.id;

        // Delete old ticket types
        await supabase
          .from('ticket_types')
          .delete()
          .eq('event_id', editingEvent.id);
      } else {
        // Create new event
        const { data: event, error: eventError } = await supabase
          .from('events')
          .insert(eventData)
          .select()
          .single();

        if (eventError) throw eventError;
        eventId = event.id;
      }

      // Create ticket types
      const ticketTypesData = ticketTypes.map(tt => ({
        event_id: eventId,
        name: tt.name,
        kind: tt.kind,
        price: tt.price
      }));

      const { error: ticketError } = await supabase
        .from('ticket_types')
        .insert(ticketTypesData);

      if (ticketError) throw ticketError;

      toast.success(editingEvent ? 'Event updated successfully' : 'Event created successfully');
      setIsDialogOpen(false);
      setEditingEvent(null);
      setTicketTypes([{ name: 'Standard', kind: 'free', price: 0 }]);
      loadEvents();
      onUpdate();
      // After event creation/update, allocate selected resources (venue + equipment with quantities)
      try {
        const { data: userData } = await supabase.auth.getUser();
        const organizerId = userData?.user?.id || null;

        // allocate main venue/resource (single allocation)
        if (selectedVenue && eventId) {
          await (supabase as any).from('resource_allocations').insert({
            resource_id: selectedVenue,
            event_id: eventId,
            organizer_id: organizerId,
            allocated_at: new Date().toISOString(),
            allocated_by: organizerId
          });

          await (supabase as any).from('resources').update({ status: 'allocated', allocated_to: eventId }).eq('id', selectedVenue);
        }

        // allocate extra equipment with quantities (based on rows added via + Add Equipment)
        for (const entry of selectedEquipmentEntries) {
          const eqId = entry.resourceId;
          if (!eqId) continue; // skip empty rows
          const qty = entry.qty ?? 1;
          const item = equipment.find((e) => e.id === eqId);

          // basic server-side trust: ensure qty <= capacity, otherwise skip and warn
          const available = item?.capacity ?? 0;
          if (qty > available) {
            toast.error(`Requested ${qty} units for ${item?.name} exceeds available ${available}. Allocation skipped.`);
            continue;
          }

          // create allocation record with notes about quantity
          const { error: allocErr } = await (supabase as any)
            .from('resource_allocations')
            .insert({
              resource_id: eqId,
              event_id: eventId,
              organizer_id: organizerId,
              allocated_by: organizerId,
              allocated_at: new Date().toISOString(),
              notes: `Quantity Allocated: ${qty}`
            });

          if (allocErr) {
            console.error('Failed to insert allocation for', eqId, allocErr);
            toast.error(`Failed to allocate ${item?.name}`);
            continue;
          }

          // reduce capacity and update status if necessary
          const newCapacity = Math.max(0, (item?.capacity ?? 0) - qty);
          const { error: resErr } = await (supabase as any)
            .from('resources')
            .update({ capacity: newCapacity, status: newCapacity === 0 ? 'allocated' : 'available', allocated_to: newCapacity === 0 ? eventId : null })
            .eq('id', eqId);

          if (resErr) {
            console.error('Failed to update resource capacity for', eqId, resErr);
            toast.error(`Allocation recorded but failed to update inventory for ${item?.name}`);
          } else {
            // update local equipment state so UI shows remaining immediately
            setEquipment((prev) => prev.map((r) => (r.id === eqId ? { ...r, capacity: newCapacity, status: newCapacity === 0 ? 'allocated' : r.status } : r)));
            toast.success(`Allocated ${qty} units of ${item?.name} to ${eventData.title || 'event'}. Remaining: ${newCapacity}.`);
          }
        }

        // reload resources for form to reflect updated capacities
        loadResourcesForForm();
      } catch (err) {
        console.error('Error allocating resources after event create/update:', err);
        // non-fatal: event was created, but allocations may have failed
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (event: any) => {
    setEditingEvent(event);
    setTicketTypes(event.ticket_types || [{ name: 'Standard', kind: 'free', price: 0 }]);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;

    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete event');
      return;
    }

    toast.success('Event deleted');
    loadEvents();
    onUpdate();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Events</h2>
          <p className="text-muted-foreground">Create and manage corporate events</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingEvent(null);
            setTicketTypes([{ name: 'Standard', kind: 'free', price: 0 }]);
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Event
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingEvent ? 'Edit Event' : 'Create Event'}</DialogTitle>
              <DialogDescription>
                {editingEvent ? 'Update event details' : 'Schedule a new corporate event'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Event Title</Label>
                <Input
                  id="title"
                  name="title"
                  required
                  disabled={loading}
                  placeholder="Annual Company Meeting"
                  defaultValue={editingEvent?.title || ''}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  disabled={loading}
                  placeholder="Event details and agenda..."
                  defaultValue={editingEvent?.description || ''}
                />
              </div>

                      <div>
                        <Label htmlFor="venue_select">Select Venue / Room</Label>
                        <Select value={selectedVenue} onValueChange={setSelectedVenue}>
                          <SelectTrigger id="venue_select">
                            <SelectValue placeholder="Choose a venue or room" />
                          </SelectTrigger>
                          <SelectContent>
                            {venues.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.name} — {v.location || 'Unknown'} (Capacity: {v.capacity || 'N/A'})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="mt-4">
                        <div className="flex items-center justify-between">
                          <Label>Additional Resources (Optional)</Label>
                          <Button type="button" size="sm" variant="outline" onClick={addEquipmentEntry} disabled={loading}>
                            <Plus className="h-3 w-3 mr-1" />
                            Add Equipment
                          </Button>
                        </div>

                        <div className="mt-3 space-y-2">
                          {selectedEquipmentEntries.map((entry) => {
                            const item = equipment.find((e) => e.id === entry.resourceId);
                            return (
                              <div key={entry.rowId} className="flex items-center gap-3">
                                <div className="flex-1">
                                  <Select value={entry.resourceId ?? ''} onValueChange={(val) => handleEntryResourceChange(entry.rowId, val)}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select equipment" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {equipment.map((eq) => (
                                        <SelectItem key={eq.id} value={eq.id}>
                                          {eq.name} — {eq.location || 'Unknown'} (Available: {eq.capacity ?? 0})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="w-32">
                                  <Label className="text-xs">Quantity</Label>
                                  <Input type="number" min={1} value={entry.qty} max={item?.capacity ?? 1} onChange={(e) => handleEntryQtyChange(entry.rowId, Math.max(1, Number(e.target.value) || 1))} />
                                  {equipmentValidationErrors[entry.rowId] && (
                                    <p className="text-xs text-red-600 mt-1">⚠️ {equipmentValidationErrors[entry.rowId]}</p>
                                  )}
                                </div>

                                <Button type="button" variant="ghost" size="icon" onClick={() => removeEntry(entry.rowId)} disabled={loading}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    name="start_date"
                    type="date"
                    required
                    disabled={loading}
                    min={new Date().toISOString().split('T')[0]}
                    defaultValue={editingEvent ? new Date(editingEvent.start_ts).toISOString().split('T')[0] : ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start_time">Start Time</Label>
                  <Input
                    id="start_time"
                    name="start_time"
                    type="time"
                    required
                    disabled={loading}
                    defaultValue={editingEvent ? new Date(editingEvent.start_ts).toTimeString().slice(0, 5) : ''}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date</Label>
                  <Input
                    id="end_date"
                    name="end_date"
                    type="date"
                    required
                    disabled={loading}
                    min={new Date().toISOString().split('T')[0]}
                    defaultValue={editingEvent ? new Date(editingEvent.end_ts).toISOString().split('T')[0] : ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_time">End Time</Label>
                  <Input
                    id="end_time"
                    name="end_time"
                    type="time"
                    required
                    disabled={loading}
                    defaultValue={editingEvent ? new Date(editingEvent.end_ts).toTimeString().slice(0, 5) : ''}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity Override (optional)</Label>
                <Input
                  id="capacity"
                  name="capacity"
                  type="number"
                  min="1"
                  disabled={loading}
                  placeholder="Leave empty to use venue capacity"
                  defaultValue={editingEvent?.capacity || ''}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Ticket Types</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setTicketTypes([...ticketTypes, { name: '', kind: 'free', price: 0 }])}
                    disabled={loading}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Ticket Type
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {ticketTypes.map((ticket, index) => (
                    <div key={index} className="flex gap-2 items-end p-3 border rounded-lg">
                      <div className="flex-1 space-y-2">
                        <Label htmlFor={`ticket-name-${index}`}>Name</Label>
                        <Input
                          id={`ticket-name-${index}`}
                          value={ticket.name}
                          onChange={(e) => {
                            const newTickets = [...ticketTypes];
                            newTickets[index].name = e.target.value;
                            setTicketTypes(newTickets);
                          }}
                          placeholder="VIP, Early Bird, etc."
                          required
                          disabled={loading}
                        />
                      </div>
                      
                      <div className="w-32 space-y-2">
                        <Label htmlFor={`ticket-kind-${index}`}>Type</Label>
                        <Select
                          value={ticket.kind}
                          onValueChange={(value: 'free' | 'paid') => {
                            const newTickets = [...ticketTypes];
                            newTickets[index].kind = value;
                            if (value === 'free') newTickets[index].price = 0;
                            setTicketTypes(newTickets);
                          }}
                          disabled={loading}
                        >
                          <SelectTrigger id={`ticket-kind-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">Free</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {ticket.kind === 'paid' && (
                        <div className="w-32 space-y-2">
                          <Label htmlFor={`ticket-price-${index}`}>Price (₹)</Label>
                          <Input
                            id={`ticket-price-${index}`}
                            type="number"
                            min="1"
                            value={ticket.price}
                            onChange={(e) => {
                              const newTickets = [...ticketTypes];
                              newTickets[index].price = parseFloat(e.target.value) || 0;
                              setTicketTypes(newTickets);
                            }}
                            required
                            disabled={loading}
                          />
                        </div>
                      )}
                      
                      {ticketTypes.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setTicketTypes(ticketTypes.filter((_, i) => i !== index))}
                          disabled={loading}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || Object.keys(equipmentValidationErrors).length > 0}>
                  {loading ? (editingEvent ? 'Updating...' : 'Creating...') : (editingEvent ? 'Update Event' : 'Create Event')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {events.map((event) => (
          <Card key={event.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <CardTitle>{event.title}</CardTitle>
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(event.start_ts), 'PPp')} - {format(new Date(event.end_ts), 'p')}
                    </div>
                    {event.venue_name && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {event.venue_name}
                        {event.venue_location && ` - ${event.venue_location}`}
                      </div>
                    )}
                    {event.capacity && (
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Capacity: {event.capacity}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(event)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(event.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {event.description && (
              <CardContent>
                <p className="text-sm text-muted-foreground">{event.description}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {events.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No events yet. Create your first event to get started.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}