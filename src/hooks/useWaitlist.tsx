import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface UseWaitlistProps {
  eventId?: string;
}

export const useWaitlist = ({ eventId }: UseWaitlistProps = {}) => {
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchWaitlist = async () => {
    try {
      let query = supabase
        .from('registrations')
        .select(`
          *,
          profiles!registrations_user_id_fkey(email, display_name),
          events!registrations_event_id_fkey(title),
          ticket_types!registrations_ticket_type_id_fkey(name)
        `)
        .eq('status', 'waitlisted')
        .order('created_at', { ascending: true });

      if (eventId) {
        query = query.eq('event_id', eventId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setWaitlist(data || []);
    } catch (error: any) {
      console.error('Error fetching waitlist:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch waitlist',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    fetchWaitlist();
  }, [eventId]);

  const addToWaitlist = async (registrationId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('registrations')
        .update({ status: 'waitlisted' })
        .eq('id', registrationId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Added to waitlist'
      });

      await fetchWaitlist();
    } catch (error: any) {
      console.error('Error adding to waitlist:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const promoteFromWaitlist = async (registrationId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('registrations')
        .update({ status: 'confirmed' })
        .eq('id', registrationId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Promoted from waitlist to confirmed'
      });

      await fetchWaitlist();
    } catch (error: any) {
      console.error('Error promoting from waitlist:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const removeFromWaitlist = async (registrationId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('registrations')
        .delete()
        .eq('id', registrationId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Removed from waitlist'
      });

      await fetchWaitlist();
    } catch (error: any) {
      console.error('Error removing from waitlist:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    waitlist,
    loading,
    addToWaitlist,
    promoteFromWaitlist,
    removeFromWaitlist,
    refreshWaitlist: fetchWaitlist
  };
};
