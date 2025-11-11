// integration.test.tsx
import { vi, describe, it, expect } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import Dashboard from '@/pages/Dashboard';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { BrowserRouter, Routes, Route, MemoryRouter, Navigate } from 'react-router-dom';
import EventCard from '@/components/EventCard';
import { toast } from 'sonner';

// Silence recursive console errors from setupTests.ts
vi.spyOn(console, 'error').mockImplementation(() => {});

// ====================================================================
// Mock Setup — Final, Hoist-Safe, Self-Returning Supabase Mock
// ====================================================================

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ✅ Full Supabase mock client definition (hoist-safe factory)
vi.mock('@/integrations/supabase/client', () => {
  // Create a self-returning builder local to the factory so hoisting is safe.
  const builder: any = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.gte = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.insert = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);

  const mockSupabase: any = {
    ...builder,
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    channel: vi.fn(() => {
      const mockChannel: any = { on: vi.fn(() => mockChannel) } as any;
      mockChannel.subscribe = vi.fn(() => mockChannel);
      mockChannel.unsubscribe = vi.fn();
      mockChannel.removeChannel = vi.fn();
      return mockChannel;
    }),
    from: vi.fn(() => builder),
  };

  // Expose mocks to the test scope via globals so tests can control them.
  globalThis.__SUPABASE_MOCK__ = mockSupabase;
  globalThis.__SUPABASE_BUILDER__ = builder;
  return { supabase: mockSupabase };
});

// Re-declare the mock objects in the outer scope for test control
const mockSupabase = globalThis.__SUPABASE_MOCK__;
const mockBuilder: any = globalThis.__SUPABASE_BUILDER__;

// ✅ Mock sonner toast
vi.mock('sonner', async () => {
  return {
    toast: {
      success: vi.fn(),
      error: vi.fn(),
      promise: vi.fn(),
      warning: vi.fn(),
    },
    default: vi.fn(() => <div data-testid="mock-sonner-toaster" />),
  };
});

// ====================================================================
// Mock Components (for Dashboard context)
// ====================================================================
vi.mock('@/components/EventManager', () => ({ default: () => <div data-testid="event-manager" /> }));
vi.mock('@/components/EventCheckIn', () => ({ default: () => <div data-testid="event-checkin" /> }));
vi.mock('@/components/RegistrationsList', () => ({ default: () => <div data-testid="registrations-list" /> }));
vi.mock('@/components/WaitlistManagement', () => ({ WaitlistManagement: () => <div data-testid="waitlist-manager" /> }));
vi.mock('@/pages/ResourceManagement', () => ({ default: () => <div data-testid="resource-manager-page" /> }));
vi.mock('@/components/MyRegistrations', () => ({ default: () => <div data-testid="my-registrations" /> }));
vi.mock('@/components/Navbar', () => ({ default: () => <div data-testid="navbar" /> }));

// Hoist-safe react-router-dom mock that delegates to real hooks but allows tests
// to override navigate/location via globals: __MOCK_NAVIGATE__, __MOCK_LOCATION__
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => (globalThis.__MOCK_NAVIGATE__ ?? actual.useNavigate()),
    useLocation: () => (globalThis.__MOCK_LOCATION__ ?? actual.useLocation()),
  };
});

// ====================================================================
// Test Data
// ====================================================================
const mockOrganizerUser = { id: 'org-123', email: 'organizer@test.com' };
const mockOrganizerProfile = { id: 'org-123', email: 'organizer@test.com', display_name: 'Org User', role: 'organizer' };
const mockParticipantUser = { id: 'part-456', email: 'participant@test.com' };
const mockParticipantProfile = { id: 'part-456', email: 'participant@test.com', display_name: 'Part User', role: 'participant' };

const mockEvent = {
  id: 'event-1',
  title: 'Quarterly Review',
  description: 'Discussing Q3 results.',
  start_ts: '2025-12-01T10:00:00Z',
  venue_name: 'Hall A',
  capacity: 200,
  ticket_types: [
    { id: 'ticket-free', name: 'Standard', kind: 'free', price: 0 },
    { id: 'ticket-paid', name: 'VIP', kind: 'paid', price: 500 },
  ],
};

// ====================================================================
// Helper: Render Dashboard with Mocks
// ====================================================================
const renderDashboardWithMocks = (user: any, profile: any) => {
  vi.clearAllMocks();

  // Reset/set mock builder properties for fresh start in every test.
  mockBuilder.single.mockClear();
  mockBuilder.maybeSingle.mockClear();

  // Set the mock response for fetching the user profile (used by AuthContext)
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: profile, error: null })),
          })),
        })),
      };
    }
    // Mock event fetch logic for ParticipantDashboard
    if (table === 'events' && profile.role === 'participant') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [mockEvent], error: null })),
            })),
          })),
        })),
      };
    }
    // Mock the general builder for all other tables
    return mockBuilder;
  });

  // Set the session state for AuthProvider
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: user ? { user, access_token: 'token' } : null },
    error: null,
  });

  // Since React Router is involved, we render the entry point to simulate navigation
  return render(
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <AuthProvider>
              <Dashboard />
            </AuthProvider>
          }
        />
        <Route path="/ticket-success" element={<div data-testid="ticket-success-page" />} />
        <Route path="/payment" element={<div data-testid="payment-page" />} />
        <Route path="/auth" element={<div data-testid="auth-page" />} />
      </Routes>
    </BrowserRouter>
  );
};

// Small ProtectedRoute helper to mirror App.tsx behavior for these tests
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

// ====================================================================
// Tests
// ====================================================================
describe('Integration Tests', () => {

  // IT-01: Renders Organizer Dashboard
  it('IT-01: Renders Organizer Dashboard when authenticated user has "organizer" role', async () => {
    await act(async () => {
      renderDashboardWithMocks(mockOrganizerUser, mockOrganizerProfile);
    });

    await waitFor(() => {
      expect(screen.getByText('Organizer Dashboard')).toBeInTheDocument();
    });
    expect(screen.getByTestId('event-manager')).toBeInTheDocument();
  });

  // IT-02: Renders Participant Dashboard
  it('IT-02: Renders Participant Dashboard when authenticated user has "participant" role', async () => {
    await act(async () => {
      renderDashboardWithMocks(mockParticipantUser, mockParticipantProfile);
    });

    await waitFor(() => {
      expect(screen.getByText('Upcoming Events')).toBeInTheDocument();
    });
    expect(screen.getByText(mockEvent.title)).toBeInTheDocument();
  });

  // IT-03: Successful Free Ticket Registration flows to success page
  it('IT-03: Successful Free Ticket Registration flows to success page and calls backend APIs', async () => {
    vi.clearAllMocks();
    import.meta.env.VITE_ATTENDEE_MANAGEMENT_URL = "http://mock-supabase.com/functions/v1/attendee-management"; // Mock FN URL
    
    // 1. Mock Auth/Session
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockParticipantUser, access_token: 'token' } },
      error: null,
    });
    // 2. Mock existing registration check (no existing registration)
    mockBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    // 3. Mock create registration (fetch call)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { id: 'reg-new-free', registration_status: 'confirmed', event_id: mockEvent.id, user_id: mockParticipantUser.id, ticket_type_id: mockEvent.ticket_types[0].id, },
        }),
    });
    // 4. Mock create order (supabase insert)
    mockBuilder.insert.mockReturnValueOnce({
      select: vi.fn(() => ({
        single: vi.fn(() =>
          Promise.resolve({
            data: { id: 'order-free-1', qr_code_data: '{"data":"mock"}' },
            error: null,
          })
        ),
      })),
    });
    
    // Set up React Router navigation
  const mockNavigate = vi.fn();
  // Configure the hoist-safe router mock to use this navigate & location
  globalThis.__MOCK_NAVIGATE__ = mockNavigate;
  globalThis.__MOCK_LOCATION__ = { state: { event: mockEvent, ticketType: mockEvent.ticket_types[0] } };

    await act(async () => {
      render(
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AuthProvider><EventCard event={mockEvent} onRegister={vi.fn()} /></AuthProvider>} />
          </Routes>
        </BrowserRouter>
      );
    });

    const registerButton = screen.getByRole('button', { name: /register/i });
    await act(async () => {
      fireEvent.click(registerButton);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/attendee-management'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"action":"create_registration"'),
        })
      );
      // RPC call to increment ticket count
      expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_ticket_sold_count', {
        ticket_id: mockEvent.ticket_types[0].id,
      });
      // Final navigation
      expect(mockNavigate).toHaveBeenCalledWith('/ticket-success', expect.anything());
    });
  });

  // IT-04: Paid Ticket Registration redirects to the Payment page
  it('IT-04: Paid Ticket Registration redirects to the Payment page', async () => {
    vi.clearAllMocks();
    
    // 1. Mock Auth/Session
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockParticipantUser, access_token: 'token' } },
      error: null,
    });

    // 2. Mock existing registration check (no existing registration)
    mockBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    // Set up React Router navigation
  const mockNavigate = vi.fn();
  // Configure the hoist-safe router mock to use this navigate & location
  globalThis.__MOCK_NAVIGATE__ = mockNavigate;
  globalThis.__MOCK_LOCATION__ = { state: null };

    await act(async () => {
      render(
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AuthProvider><EventCard event={mockEvent} onRegister={vi.fn()} /></AuthProvider>} />
          </Routes>
        </BrowserRouter>
      );
    });

    const buyTicketButton = screen.getByRole('button', { name: /buy ticket/i });
    await act(async () => {
      fireEvent.click(buyTicketButton);
    });

    await waitFor(() => {
      // Check if navigation was called with the correct path and state
      expect(mockNavigate).toHaveBeenCalledWith('/payment', {
        state: {
          event: mockEvent,
          ticketType: mockEvent.ticket_types[1], // VIP ticket (paid)
        },
      });
    });
  });

  // IT-05: AuthContext Redirects Unauthenticated Users to Auth page (This checks App.tsx logic)
  it('IT-05: Unauthenticated user accessing "/" is redirected to "/auth"', async () => {
    vi.clearAllMocks();

    // 1. Mock getSession to return no user, no session
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    // 2. Mock onAuthStateChange to immediately set user=null (to complete loading)
    mockSupabase.auth.onAuthStateChange.mockImplementation((callback) => {
        callback('SIGNED_OUT', null);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    
    // We render the root App component to simulate the protected route logic
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<AuthProvider><ProtectedRoute><div data-testid="protected-content" /></ProtectedRoute></AuthProvider>} />
          <Route path="/auth" element={<div data-testid="auth-page" />} />
        </Routes>
      </MemoryRouter>
    );

    // After loading, the route should have redirected to /auth
    await waitFor(() => {
        expect(screen.getByTestId('auth-page')).toBeInTheDocument();
    });
    
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });
});