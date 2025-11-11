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

// Define resource types for clarity
const VENUE_TYPES = ['Venue', 'venue', 'Room', 'room', 'hall', 'Hall', 'outdoor', 'Outdoor','auditorium', 'Auditorium', 'other', 'Other', 'Outdoor Space'];
const EQUIPMENT_TYPES = ['Equipment', 'others', 'Others', 'other', 'Service']; // Added Service

export default function EventManager({ onUpdate }: { onUpdate: () => void }) {
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([
    { name: 'Standard', kind: 'free', price: 0 }
  ]);
  
  // State for form resources
  const [venues, setVenues] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  
  // State for form selections
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
      .in('type', VENUE_TYPES)
      .eq('status', 'available')
      .order('name');

    if (!vErr) setVenues(venuesData || []);

    // load available equipment
    const { data: equipData, error: eErr } = await (supabase as any)
      .from('resources')
      .select('*')
      .in('type', EQUIPMENT_TYPES) // Use the array here
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

  // Helper function to parse quantity from notes
  const parseQtyFromNotes = (notes: string | null): number => {
    if (!notes) return 0;
    try {
      const qty = notes.match(/Quantity Allocated: (\d+)/);
      if (qty && qty[1]) {
        return parseInt(qty[1]) || 0;
      }
      return 0;
    } catch (e) {
      return 0;
    }
  };

  // Helper function to release all resources for a given eventId
  const releaseAllResourcesForEvent = async (eventId: string) => {
    const { data: oldAllocations, error: oldAllocError } = await supabase
      .from('resource_allocations')
      .select('*, resources(type, capacity)') // Join with resources
      .eq('event_id', eventId);
    
    if (oldAllocError) {
      console.error('Error fetching old allocations:', oldAllocError);
      toast.error('Could not fetch old allocations to release them.');
      return; // Stop if we can't fetch them
    }

    if (!oldAllocations || oldAllocations.length === 0) {
      return; // Nothing to release
    }

    for (const alloc of oldAllocations) {
      const resource = (alloc as any).resources;
      if (!resource) continue; // Resource might have been deleted

      if (VENUE_TYPES.includes(resource.type)) {
        // It's a venue, just set to available
        await (supabase as any)
          .from('resources')
          .update({ status: 'available', allocated_to: null })
          .eq('id', alloc.resource_id);
      } else if (EQUIPMENT_TYPES.includes(resource.type)) {
        // It's equipment, restore capacity
        const oldQty = parseQtyFromNotes(alloc.notes);
        const newCapacity = (resource.capacity || 0) + oldQty;
        await (supabase as any)
          .from('resources')
          .update({ capacity: newCapacity, status: 'available', allocated_to: null })
          .eq('id', alloc.resource_id);
      }
    }

    // After updating resources, delete all allocation records for this event
    await supabase
      .from('resource_allocations')
      .delete()
      .eq('event_id', eventId);
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
        resource_id: selectedVenue || null, // Main venue link
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

      // --- Resource Allocation Logic ---
      try {
        const { data: userData } = await supabase.auth.getUser();
        const organizerId = userData?.user?.id || null;

        // **FIX: If editing, release all old resources first**
        if (editingEvent) {
          await releaseAllResourcesForEvent(eventId);
        }

        // --- Allocate all NEW resources from the form (for both Create and Edit) ---
        
        // 1. Allocate main venue
        if (selectedVenue && eventId) {
          const { error: venueAllocErr } = await (supabase as any).from('resource_allocations').insert({
            resource_id: selectedVenue,
            event_id: eventId,
            organizer_id: organizerId,
            allocated_at: new Date().toISOString()
            // No 'allocated_by'
          });

          if (!venueAllocErr) {
            await (supabase as any).from('resources').update({ status: 'allocated', allocated_to: eventId }).eq('id', selectedVenue);
          } else {
             toast.error(`Failed to allocate main venue: ${venueAllocErr.message}`);
          }
        }

        // 2. Allocate extra equipment
        for (const entry of selectedEquipmentEntries) {
          const eqId = entry.resourceId;
          if (!eqId) continue; 
          const qty = entry.qty ?? 1;
          
          // Get the item from the *current* state, which was loaded from DB
          const item = equipment.find((e) => e.id === eqId);
          const available = item?.capacity ?? 0;

          if (qty > available) {
            toast.error(`Requested ${qty} units for ${item?.name} exceeds available ${available}. Allocation skipped.`);
            continue;
          }

          const { error: allocErr } = await (supabase as any)
            .from('resource_allocations')
            .insert({
              resource_id: eqId,
              event_id: eventId,
              organizer_id: organizerId,
              allocated_at: new Date().toISOString(),
              notes: `Quantity Allocated: ${qty}`
              // No 'allocated_by'
            });

          if (allocErr) {
            console.error('Failed to insert allocation for', eqId, allocErr);
            toast.error(`Failed to allocate ${item?.name}: ${allocErr.message}`);
            continue;
          }

          // reduce capacity
          const newCapacity = Math.max(0, available - qty);
          const { error: resErr } = await (supabase as any)
            .from('resources')
            .update({
              capacity: newCapacity,
              status: newCapacity === 0 ? 'allocated' : 'available',
              allocated_to: newCapacity === 0 ? eventId : null
            })
            .eq('id', eqId);

          if (resErr) {
            toast.error(`Allocation recorded but failed to update inventory for ${item?.name}`);
          } else {
            toast.success(`Allocated ${qty} units of ${item?.name}.`);
          }
        }
      } catch (err: any) {
        console.error('Error during resource allocation:', err);
        toast.error(`Event saved, but resource allocation failed: ${err.message}`);
      }
      
      // --- End Resource Allocation Logic ---

      toast.success(editingEvent ? 'Event updated successfully' : 'Event created successfully');
      setIsDialogOpen(false);
      // Reset form state is handled by onOpenChange
      loadEvents(); // Reload events list
      loadResourcesForForm(); // Reload resources to show new capacities
      onUpdate(); // Trigger dashboard update

    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (event: any) => {
    // 1. Set basic event data
    setEditingEvent(event);
    setTicketTypes(event.ticket_types || [{ name: 'Standard', kind: 'free', price: 0 }]);
    
    // 2. **FIX: Load existing allocations into the form**
    setSelectedVenue(event.resource_id || ''); // Set main venue
  
    // 3. Fetch all allocations for this event
    const { data, error } = await (supabase as any)
      .from('resource_allocations')
      .select('*, resources(type, name, capacity)') // Join to get resource info
      .eq('event_id', event.id);
  
    if (error) {
      toast.error('Failed to load event\'s allocated resources');
    } else if (data) {
      
      // 4. Pre-fill the "Additional Resources" list
      const equipmentAllocs = data.filter((a: any) => 
        a.resource_id !== event.resource_id && a.resources && EQUIPMENT_TYPES.includes(a.resources.type)
      );
      
      const entries = equipmentAllocs.map((a: any) => ({
        rowId: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        resourceId: a.resource_id,
        qty: parseQtyFromNotes(a.notes) || 1
      }));
      setSelectedEquipmentEntries(entries);
      
      // 5. **Add** allocated resources to the dropdown lists if they aren't already there
      // This ensures they are selectable/visible even if now fully allocated
      const allocatedVenues = data
        .filter((a: any) => a.resource_id === event.resource_id && a.resources && VENUE_TYPES.includes(a.resources.type))
        .map((a: any) => ({...a.resources, id: a.resource_id})); // Re-shape data
        
      const allocatedEquipment = equipmentAllocs.map((a: any) => ({...a.resources, id: a.resource_id}));

      // Use a Set to avoid duplicates
      setVenues(prev => [...prev, ...allocatedVenues.filter(av => !prev.find(v => v.id === av.id))]);
      setEquipment(prev => [...prev, ...allocatedEquipment.filter(ae => !prev.find(e => e.id === ae.id))]);
    }
    
    setIsDialogOpen(true);
  };
  

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this event? This will also release all allocated resources.')) return;

    // **FIX: Release all resources *before* deleting the event**
    try {
      setLoading(true);
      await releaseAllResourcesForEvent(id);
      toast.success('Resources for event have been released.');
    } catch (err: any) {
      console.error('Failed to release resources:', err);
      toast.error(`Failed to release resources: ${err.message}. Deleting event anyway...`);
    }

    // Now, delete the event
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error(`Failed to delete event: ${error.message}`);
    } else {
      toast.success('Event deleted successfully.');
    }
    
    setLoading(false);
    loadEvents();
    loadResourcesForForm(); // Reload resources
    onUpdate();
  };

  const resetFormState = () => {
    setEditingEvent(null);
    setTicketTypes([{ name: 'Standard', kind: 'free', price: 0 }]);
    setSelectedVenue('');
    setSelectedEquipmentEntries([]);
    setEquipmentValidationErrors({});
    // We don't reload all resources here, just reset the form
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
            resetFormState();
          }
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              // Ensure lists are fresh when opening for 'Create'
              resetFormState();
              loadResourcesForForm();
              setIsDialogOpen(true);
            }}>
              <Plus className="mr-2 h-4 w-4" />
              Create Event
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingEvent ? 'Edit Event' : 'Create Event'}</DialogTitle>
              <DialogDescription>
                {editingEvent ? 'Update event details and resource allocations' : 'Schedule a new corporate event'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Event Title */}
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

              {/* Description */}
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

              {/* Venue Select */}
              <div>
                <Label htmlFor="venue_select">Select Venue / Room</Label>
                <Select value={selectedVenue} onValueChange={setSelectedVenue} disabled={loading}>
                  <SelectTrigger id="venue_select">
                    <SelectValue placeholder="Choose a venue or room" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Show current venue even if it's not 'available' anymore */}
                    {editingEvent && editingEvent.resource_id && !venues.find(v => v.id === editingEvent.resource_id) && (
                      <SelectItem key={editingEvent.resource_id} value={editingEvent.resource_id}>
                        {editingEvent.venue_name} (Currently Allocated)
                      </SelectItem>
                    )}
                    {venues.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name} — {v.location || 'Unknown'} (Capacity: {v.capacity || 'N/A'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Additional Resources */}
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
                    // Find item in available list
                    const item = equipment.find((e) => e.id === entry.resourceId);
                    
                    // For editing: if item is already allocated, find its details from editingEvent's loaded data
                    let displayItem = item;
                    if (!displayItem && editingEvent) {
                      const alloc = (editingEvent.allocations || []).find((a: any) => a.resource_id === entry.resourceId);
                      if (alloc && alloc.resources) {
                        displayItem = {
                          id: alloc.resource_id,
                          name: alloc.resources.name,
                          capacity: (alloc.resources.capacity || 0) + parseQtyFromNotes(alloc.notes), // Show capacity *before* this event
                          location: alloc.resources.location
                        };
                      }
                    }
                    
                    // Max capacity is the item's current available capacity
                    const maxQty = item ? item.capacity : (displayItem ? displayItem.capacity : 1);
                    const displayName = displayItem ? `${displayItem.name} — (Available: ${displayItem.capacity ?? 0})` : 'Select equipment';
                    
                    return (
                      <div key={entry.rowId} className="flex items-center gap-3">
                        <div className="flex-1">
                          <Select value={entry.resourceId ?? ''} onValueChange={(val) => handleEntryResourceChange(entry.rowId, val)} disabled={loading}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select equipment" />
                            </SelectTrigger>
                            <SelectContent>
                              {/* Show current item even if it's not 'available' */}
                              {entry.resourceId && !equipment.find(e => e.id === entry.resourceId) && (
                                <SelectItem key={entry.resourceId} value={entry.resourceId}>
                                  {displayItem ? `${displayItem.name} (Allocated)` : `ID: ${entry.resourceId.slice(0, 8)}...`}
                                </SelectItem>
                              )}
                              {equipment.map((eq) => (
                                <SelectItem key={eq.id} value={eq.id}>
                                  {eq.name} — (Available: {eq.capacity ?? 0})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="w-32">
                          <Label className="text-xs">Quantity</Label>
                          <Input 
                            type="number" 
                            min={1} 
                            value={entry.qty} 
                            max={maxQty} // Set max to available capacity
                            onChange={(e) => handleEntryQtyChange(entry.rowId, Math.max(1, Number(e.target.value) || 1))} 
                            disabled={loading}
                          />
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

              {/* Start/End Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    name="start_date"
                    type="date"
                    required
                    disabled={loading}
                    min={!editingEvent ? new Date().toISOString().split('T')[0] : undefined}
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
                    min={!editingEvent ? new Date().toISOString().split('T')[0] : undefined}
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

              {/* Capacity Override */}
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

              {/* Ticket Types */}
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
                      {/* Ticket Name */}
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

                      {/* Ticket Kind (Free/Paid) */}
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

                      {/* Ticket Price (if Paid) */}
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

                      {/* Remove Ticket Type Button */}
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

              {/* Form Actions */}
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

      {/* Event List */}
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
                    onClick={() => handleEdit(event)} // This now correctly pre-fills the form
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(event.id)} // This now correctly releases resources
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

      {/* No Events Placeholder */}
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