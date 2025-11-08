import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

function escapeCsvField(value: any) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ReportsManager() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleDownload = async () => {
    setLoading(true);
    try {
      // Resource Utilization
      const { data: resources } = await (supabase as any)
        .from('resources')
        .select('id, name, type, status, capacity');

      const { data: allocCounts } = await (supabase as any)
        .from('resource_allocations')
        .select('resource_id, id');

      const totalAllocations = (allocCounts || []).length;

      const resourcesRows = (resources || []).map((r: any) => {
        const timesAllocated = (allocCounts || []).filter((a: any) => a.resource_id === r.id).length;
        const allocatedPct = totalAllocations > 0 ? (timesAllocated / totalAllocations) * 100 : 0;
        return {
          name: r.name,
          type: r.type,
          status: r.status,
          allocated_pct: allocatedPct.toFixed(1),
          times_allocated: timesAllocated
        };
      });

      // Attendance report
      const { data: events } = await (supabase as any)
        .from('events')
        .select('id, title');

      const attendanceRows: any[] = [];
      for (const ev of (events || [])) {
        const { count: totalParticipants } = await (supabase as any)
          .from('registrations')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', ev.id)
          .eq('status', 'confirmed');

        const { count: checkedIn } = await (supabase as any)
          .from('checkins')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', ev.id)
          .eq('status', 'checked_in');

        attendanceRows.push({
          event_title: ev.title,
          total_participants: totalParticipants ?? 0,
          checked_in: checkedIn ?? 0,
          pending: Math.max((totalParticipants ?? 0) - (checkedIn ?? 0), 0)
        });
      }

      // Capacity Management Report
      const totalEventsCount = (events || []).length || 1;
      const capacityRows = (resources || []).map((r: any) => {
        const eventsUsing = (allocCounts || []).filter((a: any) => a.resource_id === r.id).map((a: any) => a.id).length;
        const utilizationPct = totalEventsCount > 0 ? (eventsUsing / totalEventsCount) * 100 : 0;
        return {
          name: r.name,
          capacity: r.capacity ?? '',
          events_using: eventsUsing,
          utilization_pct: utilizationPct.toFixed(1)
        };
      });

      // Build CSV
      const lines: string[] = [];
      // Resource Utilization header
      lines.push('Resource Utilization Report');
      lines.push('Resource Name,Type,Status,Allocated %,Times Allocated');
      for (const r of resourcesRows) {
        lines.push([
          escapeCsvField(r.name),
          escapeCsvField(r.type),
          escapeCsvField(r.status),
          escapeCsvField(r.allocated_pct),
          escapeCsvField(r.times_allocated)
        ].join(','));
      }

      lines.push('');
      // Attendance
      lines.push('Attendance Report');
      lines.push('Event Title,Total Participants,Checked-In,Pending');
      for (const a of attendanceRows) {
        lines.push([
          escapeCsvField(a.event_title),
          escapeCsvField(a.total_participants),
          escapeCsvField(a.checked_in),
          escapeCsvField(a.pending)
        ].join(','));
      }

      lines.push('');
      // Capacity
      lines.push('Capacity Management Report');
      lines.push('Resource Name,Capacity,Events Using Resource,Utilization %');
      for (const c of capacityRows) {
        lines.push([
          escapeCsvField(c.name),
          escapeCsvField(c.capacity),
          escapeCsvField(c.events_using),
          escapeCsvField(c.utilization_pct)
        ].join(','));
      }

      const csv = lines.join('\n');
      const date = new Date().toISOString().slice(0, 10);
      downloadCsv(`Resource_Report_${date}.csv`, csv);
      toast({ title: 'Report generated', description: 'CSV download should begin shortly.' });
    } catch (err: any) {
      console.error('Failed to generate report:', err);
      toast({ title: 'Error', description: String(err?.message || err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-6">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Reports system tables need to be created in the database. Please set up the required database schema first.
        </AlertDescription>
      </Alert>
      
      <Card>
        <CardHeader>
          <CardTitle>Reports & Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              This module will generate reports on resource utilization, attendance, and capacity management.
            </p>
            <div className="flex items-center gap-3">
              <Button onClick={handleDownload} disabled={loading}>
                {loading ? 'Generating...' : 'Download Report (CSV)'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
