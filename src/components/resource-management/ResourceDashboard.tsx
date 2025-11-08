import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    fetchDashboardStats();

    const interval = setInterval(fetchDashboardStats, 30000);

    return () => clearInterval(interval);
  }, []);

  const fetchDashboardStats = async () => {
    try {
      // Placeholder stats - will be populated once database tables are created
      setStats({
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Resources</p>
              <p className="text-2xl font-bold">{stats.totalResources}</p>
              <p className="text-xs text-muted-foreground">
                {stats.availableResources} available, {stats.allocatedResources} allocated
              </p>
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
                <div
                  className="bg-info h-2 rounded-full"
                  style={{ width: `${stats.utilizationRate}%` }}
                ></div>
              </div>
            </div>
            <TrendingUp className="h-8 w-8 text-info" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Events</p>
              <p className="text-2xl font-bold">{stats.totalEvents}</p>
              <p className="text-xs text-success">
                {stats.upcomingEvents} upcoming
              </p>
            </div>
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Tickets</p>
              <p className="text-2xl font-bold">{stats.totalTickets}</p>
              <p className="text-xs text-muted-foreground">
                Issued for all events
              </p>
            </div>
            <Users className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Checked In</p>
              <p className="text-2xl font-bold text-success">{stats.checkedInTickets}</p>
              <p className="text-xs text-muted-foreground">
                Successful check-ins
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-success" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pending Check-ins</p>
              <p className="text-2xl font-bold text-warning">{stats.pendingCheckIns}</p>
              <p className="text-xs text-muted-foreground">
                Awaiting check-in
              </p>
            </div>
            <Clock className="h-8 w-8 text-warning" />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">System Status</p>
              <p className="text-2xl font-bold text-success">All Systems Operational</p>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-success rounded-full"></div>
                  <span className="text-xs">Database</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-success rounded-full"></div>
                  <span className="text-xs">API Functions</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-success rounded-full"></div>
                  <span className="text-xs">Check-in System</span>
                </div>
              </div>
            </div>
            <Activity className="h-8 w-8 text-success" />
          </CardContent>
        </Card>
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

            <div
              className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => onNavigate?.('allocations')}
            >
              <Users className="h-6 w-6 text-warning mb-2" />
              <h3 className="font-semibold">Resource Allocation</h3>
              <p className="text-sm text-muted-foreground">Allocate resources to events</p>
            </div>

            <div
              className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => onNavigate?.('checkin')}
            >
              <CheckCircle className="h-6 w-6 text-success mb-2" />
              <h3 className="font-semibold">Process Check-ins</h3>
              <p className="text-sm text-muted-foreground">Scan QR codes and manage attendance</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
