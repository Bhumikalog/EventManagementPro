import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useAttendees = () => {
  const [attendees, setAttendees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchAttendees = async () => {
    try {
      const { data, error } = await supabase
        .from('attendees')
        .select('*')
        .order('registration_timestamp', { ascending: false });

      if (error) throw error;
      setAttendees(data || []);
    } catch (error: any) {
      console.error('Error fetching attendees:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    fetchAttendees();
  }, []);

  const registerAttendee = async (attendeeData: any) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('attendee-registration', {
        body: attendeeData,
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Attendee registered successfully'
      });

      await fetchAttendees();
      return { success: true, data };
    } catch (error: any) {
      console.error('Error registering attendee:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  const updateRSVP = async (attendeeId: string, rsvpStatus: string) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('attendee-registration', {
        body: { attendee_id: attendeeId, rsvp_status: rsvpStatus },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'RSVP updated successfully'
      });

      await fetchAttendees();
      return { success: true };
    } catch (error: any) {
      console.error('Error updating RSVP:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  return {
    attendees,
    loading,
    registerAttendee,
    updateRSVP,
    refreshAttendees: fetchAttendees
  };
};
