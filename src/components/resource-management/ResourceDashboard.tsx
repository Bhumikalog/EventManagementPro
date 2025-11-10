import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import {
  MapPin,
  Users,
  Calendar,
  CheckCircle,
  Clock,
  TrendingUp,
  Activity
} from 'lucide-react';

interface DashboardStats {
  totalResources: number;
  availableResources: number;
  allocatedResources: number;
  totalEvents: number;
  upcomingEvents: number;
  totalTickets: number;
  checkedInTickets: number;
  pendingCheckIns: number;
  utilizationRate: number;
}

interface DashboardProps {
  onNavigate?: (tab: string) => void;
}

export function ResourceDashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats>({
    totalResources: 0,
    availableResources: 0,
    allocatedResources: 0,
    totalEvents: 0,
    upcomingEvents: 0,
    totalTickets: 0,
    checkedInTickets: 0,
    pendingCheckIns: 0,
    utilizationRate: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const realtimeChannelRef = useRef<any>(null);

  useEffect(() => {
    fetchDashboardStats();

    // subscribe to realtime changes for resources, resource_allocations, checkins, and registrations
    const channel = supabase.channel('public:resource-management')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' }, () => fetchDashboardStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resource_allocations' }, () => fetchDashboardStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, () => fetchDashboardStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => fetchDashboardStats())
      .subscribe();

    realtimeChannelRef.current = channel;

    const interval = setInterval(fetchDashboardStats, 30000);

    // Listen for manual refresh events (dispatched after check-in)
    const onManualRefresh = () => fetchDashboardStats();
    window.addEventListener('refreshCheckInData', onManualRefresh as EventListener);

    return () => {
      clearInterval(interval);
      window.removeEventListener('refreshCheckInData', onManualRefresh as EventListener);
      try {
        if (realtimeChannelRef.current) {
          supabase.removeChannel(realtimeChannelRef.current);
        }
      } catch (e) {
        // ignore
      }
    };
  }, []);

  const fetchDashboardStats = async () => {
    setIsLoading(true);
    try {
      // total resources
      const { count: totalResourcesCount } = await (supabase as any)
        .from('resources')
        .select('id', { count: 'exact', head: true });

      // available
      const { count: availableCount } = await (supabase as any)
        .from('resources')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'available');

      // allocated
      const { count: allocatedCount } = await (supabase as any)
        .from('resources')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'allocated');

      // checked in (from checkins table where status = 'checked_in')
      const { count: checkedInCount } = await (supabase as any)
        .from('checkins')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'checked_in');

      // total confirmed registrations
      const { count: totalConfirmed } = await (supabase as any)
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'confirmed');

      const totalResources = totalResourcesCount ?? 0;
      const availableResources = availableCount ?? 0;
      const allocatedResources = allocatedCount ?? 0;
      const checkedInTickets = checkedInCount ?? 0;
      const pendingCheckIns = Math.max((totalConfirmed ?? 0) - checkedInTickets, 0);

      const utilizationRate = totalResources > 0 ? (allocatedResources / totalResources) * 100 : 0;

      setStats((prev) => ({
        ...prev,
        totalResources,
        availableResources,
        allocatedResources,
        checkedInTickets,
        pendingCheckIns,
        utilizationRate,
      }));
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-16 bg-muted rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Resource Management Dashboard</h2>
        <Badge variant="outline" className="flex items-center gap-1">
          <Activity className="h-3 w-3" />
          Live Data
        </Badge>
      </div>

  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Resources</p>
              <p className="text-2xl font-bold">{stats.totalResources}</p>
              <p className="text-xs text-muted-foreground">{stats.availableResources} available, {stats.allocatedResources} allocated</p>
            </div>
            <MapPin className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Resource Utilization</p>
              <p className="text-2xl font-bold text-info">{stats.utilizationRate.toFixed(1)}%</p>
              <div className="w-full bg-muted rounded-full h-2 mt-2">
                <div className="bg-info h-2 rounded-full" style={{ width: `${stats.utilizationRate}%` }} />
              </div>
            </div>
            <TrendingUp className="h-8 w-8 text-info" />
          </CardContent>
        </Card>

        {/* Removed: Checked In and Pending Check-ins cards per request */}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => onNavigate?.('resources')}
            >
              <MapPin className="h-6 w-6 text-info mb-2" />
              <h3 className="font-semibold">Manage Resources</h3>
              <p className="text-sm text-muted-foreground">Add, edit, or remove resources</p>
            </div>

            {/* Resource Allocation quick action removed per request 

            <div
              className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => onNavigate?.('checkin')}
            >
              <CheckCircle className="h-6 w-6 text-success mb-2" />
              <h3 className="font-semibold">Process Check-ins</h3>
              <p className="text-sm text-muted-foreground">Scan QR codes and manage attendance</p>
            </div>*/}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
// testing sync trigger
