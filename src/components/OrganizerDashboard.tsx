import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// VenueManager removed from dashboard
import EventManager from './EventManager';
import RegistrationsList from './RegistrationsList';
import EventCheckIn from './EventCheckIn';
import { WaitlistManagement } from './WaitlistManagement';
import { toast } from 'sonner';
import ResourceManagement from '@/pages/ResourceManagement';

export default function OrganizerDashboard() {
  const [stats, setStats] = useState({
    totalEvents: 0,
    totalRegistrations: 0,
    upcomingEvents: 0,
    totalResources: 0,
    availableResources: 0,
    allocatedResources: 0,
    checkedInParticipants: 0
  });

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    // subscribe to realtime changes for resources, allocations, and checkins
    const resourceSub = supabase.channel('public:resources')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' }, () => loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resource_allocations' }, () => loadStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, () => loadStats())
      .subscribe();

    return () => {
      try { supabase.removeChannel(resourceSub); } catch (e) { /* ignore */ }
    };
  }, []);

  const loadStats = async () => {
    try {
      const [eventsRes, regsRes, resourcesRes, allocationsRes, checkinsRes] = await Promise.all([
        supabase.from('events').select('id, start_ts', { count: 'exact' }),
        supabase.from('registrations').select('id', { count: 'exact' }),
        (supabase as any).from('resources').select('id, registration_status', { count: 'exact' }),
        (supabase as any).from('resource_allocations').select('id', { count: 'exact' }),
        (supabase as any).from('checkins').select('id', { count: 'exact' })
      ]);

      const upcoming = eventsRes.data?.filter((e: any) => new Date(e.start_ts) > new Date()).length || 0;
      const totalResources = resourcesRes.count || 0;
      const availableResources = resourcesRes.data?.filter((r: any) => r.registration_status === 'available').length || 0;
      const allocatedResources = allocationsRes.count || 0;
      const checkedInParticipants = checkinsRes.count || 0;

      setStats({
        totalEvents: eventsRes.count || 0,
        totalRegistrations: regsRes.count || 0,
        upcomingEvents: upcoming,
        totalResources,
        availableResources,
        allocatedResources,
        checkedInParticipants
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Organizer Dashboard</h1>
  <p className="text-muted-foreground">Manage events, registrations, and resources</p>
      </div>

  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>Total Resources</CardDescription>
        <CardTitle className="text-3xl">{stats.totalResources}</CardTitle>
      </CardHeader>
    </Card>
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>Available Resources</CardDescription>
        <CardTitle className="text-3xl">{stats.availableResources}</CardTitle>
      </CardHeader>
    </Card>
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>Allocated Resources</CardDescription>
        <CardTitle className="text-3xl">{stats.allocatedResources}</CardTitle>
      </CardHeader>
    </Card>
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>Checked-In Participants</CardDescription>
        <CardTitle className="text-3xl">{stats.checkedInParticipants}</CardTitle>
      </CardHeader>
    </Card>
  </div>

        <Tabs defaultValue="events" className="space-y-4">
          <TabsList>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="check-in">Check-In</TabsTrigger>
              <TabsTrigger value="registrations">Registrations</TabsTrigger>
              <TabsTrigger value="waitlist">Waitlist</TabsTrigger>
              <TabsTrigger value="resources">Resources</TabsTrigger>
            </TabsList>

        <TabsContent value="events" className="space-y-4">
          <EventManager onUpdate={loadStats} />
        </TabsContent>

        {/* Venue tab removed - no longer rendered */}

        <TabsContent value="check-in" className="space-y-4">
          <EventCheckIn />
        </TabsContent>

        <TabsContent value="registrations" className="space-y-4">
          <RegistrationsList />
        </TabsContent>

        <TabsContent value="waitlist" className="space-y-4">
          <WaitlistManagement />
        </TabsContent>
        <TabsContent value="resources" className="space-y-4">
          <ResourceManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}
