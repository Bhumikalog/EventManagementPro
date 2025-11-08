import { useAuth } from '@/contexts/AuthContext';
import OrganizerDashboard from '@/components/OrganizerDashboard';
import ParticipantDashboard from '@/components/ParticipantDashboard';
import Navbar from '@/components/Navbar';

export default function Dashboard() {
  const { profile } = useAuth();

  return (
    <div className="min-h-screen bg-muted/30">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        {profile?.role === 'organizer' ? (
          <OrganizerDashboard />
        ) : (
          <ParticipantDashboard />
        )}
      </main>
    </div>
  );
}
