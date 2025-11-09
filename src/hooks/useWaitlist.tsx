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

  // ✅ Fetch waitlist for event
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
        .eq('registration_status', 'waitlisted')
        .order('created_at', { ascending: true });

      if (eventId) query = query.eq('event_id', eventId);

      const { data, error } = await query;
      if (error) throw error;

      setWaitlist(data || []);
    } catch (error: any) {
      console.error('Error fetching waitlist:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch waitlist',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchWaitlist();
  }, [eventId]);

  // ✅ Add to waitlist
  const addToWaitlist = async (registrationId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('registrations')
        .update({ registration_status: 'waitlisted' })
        .eq('id', registrationId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Added to waitlist',
      });

      await fetchWaitlist();
    } catch (error: any) {
      console.error('Error adding to waitlist:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // ✅ Promote from waitlist using Edge Function (service role)
  const promoteFromWaitlist = async (registrationId: string) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: 'Authentication Error',
          description: 'User session not found. Please sign in again.',
          variant: 'destructive',
        });
        return;
      }

      console.log('Promoting registration via Edge Function:', registrationId);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/attendee-management`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: 'waitlist',
            waitlist_action: 'promote_from_waitlist',
            registration_id: registrationId,
          }),
        }
      );

      const result = await response.json().catch(() => ({}));
      console.log('Promote response:', response.status, result);

      if (!response.ok) {
        throw new Error(result.error || 'Failed to promote from waitlist.');
      }

      toast({
        title: 'Success',
        description: 'User promoted from waitlist to confirmed',
      });

      await fetchWaitlist();
    } catch (error: any) {
      console.error('Error promoting from waitlist:', error);
      toast({
        title: 'Error',
        description: error.message || 'Promotion failed',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // ✅ Remove from waitlist
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
        description: 'Removed from waitlist',
      });

      await fetchWaitlist();
    } catch (error: any) {
      console.error('Error removing from waitlist:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
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
    refreshWaitlist: fetchWaitlist,
  };
};
