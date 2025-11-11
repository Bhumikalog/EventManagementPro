import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Edit, Trash2, MapPin, Link2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
console.log("Function URL:", import.meta.env.VITE_SUPABASE_FUNCTIONS_URL);

interface Resource {
  id: string;
  name: string;
  type: string;
  status: string;
  location: string;
  capacity: number;
  created_at: string;
}

interface ResourceAllocation {
  event_id: string;
  events: {
    title: string;
    start_time: string;
  };
}

export function ResourceManager() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [allocations, setAllocations] = useState<Record<string, ResourceAllocation>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toast: uiToast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'hall',
    location: '',
    capacity: 100,
  });

  useEffect(() => {
    loadResources();
    const channel = supabase
      .channel('public:resources')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' }, () => loadResources())
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch (e) { /* ignore */ }
    };
  }, []);

  const loadResources = async () => {
    setLoadError(null);
    try {
      const { data, error } = await (supabase as any)
        .from('resources')
        .select('*')
        .order('name');

      if (error) {
        const msg = String(error.message || error.details || 'Failed to load resources');
        if (msg.toLowerCase().includes('does not exist') || msg.includes('42P01')) {
          setLoadError('Resources table not found. Please apply the DB migrations.');
        } else {
          setLoadError(msg);
          toast.error('Failed to load resources');
        }
        setResources([]);
        return;
      }

      setResources(data || []);

      const allocatedIds = (data || []).filter((r: any) => r.status === 'allocated').map((r: any) => r.id);
      if (allocatedIds.length > 0) {
        const { data: allocationData } = await (supabase as any)
          .from('resource_allocations')
          .select('resource_id, event_id, allocated_at, events(title, start_time)')
          .in('resource_id', allocatedIds as any[]);

        const allocationMap: Record<string, ResourceAllocation> = {};
        allocationData?.forEach((row: any) => {
          if (row.resource_id) {
            allocationMap[row.resource_id] = {
              event_id: row.event_id,
              events: {
                title: row.events?.title,
                start_time: row.events?.start_time,
              },
            };
          }
        });
        setAllocations(allocationMap);
      }
    } catch (error) {
      console.error('Error loading resources:', error);
      setLoadError(String((error as any)?.message || error));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const resourceData = { ...formData, status: 'available' };

      if (editingResource) {
        const { error } = await supabase
          .from('resources')
          .update(resourceData)
          .eq('id', editingResource.id);

        if (error) throw error;
        toast.success('Resource updated successfully');
      } else {
        const { error } = await supabase
          .from('resources')
          .insert(resourceData);

        if (error) throw error;
        toast.success('Resource created successfully');
      }

      setDialogOpen(false);
      resetForm();
      loadResources();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save resource');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this resource?')) return;

    const { error } = await (supabase as any)
      .from('resources')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete resource');
      return;
    }

    toast.success('Resource deleted');
    loadResources();
  };

  // 🆕 Allocate resource and create record in resource_allocations table
  const handleAllocate = async (resourceId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        toast.error('You must be logged in as organizer to allocate resources.');
        return;
      }

      // pick first event temporarily (can extend later)
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id')
        .limit(1)
        .single();

      if (eventError || !event) {
        toast.error('No event found to allocate resource.');
        return;
      }

      const functionUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
      const res = await fetch(`${functionUrl}/resource-management`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'allocate_resource',
          resource_id: resourceId,
          event_id: event.id,
          notes: 'Allocated via ResourceManager UI',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('Error from function:', data);
        toast.error(data.error || 'Failed to allocate resource');
        return;
      }

      // update local resource status
      await supabase
        .from('resources')
        .update({ status: 'allocated' })
        .eq('id', resourceId);

      toast.success('Resource allocated successfully');
      loadResources();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Unexpected error allocating resource');
    }
  };

  const openDialog = (resource?: Resource) => {
    if (resource) {
      setEditingResource(resource);
      setFormData({
        name: resource.name,
        type: resource.type,
        location: resource.location || '',
        capacity: resource.capacity || 100,
      });
    }
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingResource(null);
    setFormData({
      name: '',
      type: 'hall',
      location: '',
      capacity: 100,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Resource Management</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Manage event resources including halls, rooms, and venues
              </p>
            </div>
            <Button onClick={() => openDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Resource
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Allocated To</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map((resource) => (
                <TableRow key={resource.id}>
                  <TableCell className="font-medium">{resource.name}</TableCell>
                  <TableCell>{resource.type}</TableCell>
                  <TableCell>{resource.location}</TableCell>
                  <TableCell>{resource.capacity}</TableCell>
                  <TableCell>
                    <Badge variant={resource.status === 'available' ? 'default' : 'secondary'}>
                      {resource.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {resource.status === 'allocated' && allocations[resource.id] && (
                      <div className="text-sm">
                        <div className="font-medium">{allocations[resource.id].events.title}</div>
                        <div className="text-muted-foreground">
                          {new Date(allocations[resource.id].events.start_time).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDialog(resource)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(resource.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAllocate(resource.id)}
                        disabled={resource.status === 'allocated'}
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {loadError ? (
            <div className="text-center py-8">
              <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">{loadError}</p>
              <p className="text-sm text-muted-foreground">
                If you haven't applied database migrations yet, run the SQL in{' '}
                <code>supabase/migrations/20251108_create_resources_and_allocations.sql</code> in your Supabase project.
              </p>
            </div>
          ) : resources.length === 0 ? (
            <div className="text-center py-8">
              <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No resources yet. Create your first resource to get started.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} modal={false} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingResource ? 'Edit Resource' : 'Create Resource'}</DialogTitle>
            <DialogDescription>
              {editingResource ? 'Update resource information' : 'Add a new resource for events'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Resource Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hall">Hall</SelectItem>
                  <SelectItem value="room">Room</SelectItem>
                  <SelectItem value="auditorium">Auditorium</SelectItem>
                  <SelectItem value="outdoor">Outdoor Space</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Building name, floor, address..."
              />
            </div>

            <div>
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                type="number"
                min="1"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) })}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button data-testid="create-submit" type="submit" disabled={loading}>
                {loading ? 'Saving...' : editingResource ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
