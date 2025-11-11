import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { format } from 'date-fns';

// Mock UI primitives (module alias '@' isn't resolved by the test runner in this environment),
// provide lightweight components so the RegistrationsList component can import them.
vi.mock('@/components/ui/card', () => ({
  Card: (props: any) => React.createElement('div', props),
  CardHeader: (props: any) => React.createElement('div', props),
  CardContent: (props: any) => React.createElement('div', props),
  CardTitle: (props: any) => React.createElement('div', props),
}));

vi.mock('@/components/ui/table', () => ({
  Table: (props: any) => React.createElement('table', props),
  TableHeader: (props: any) => React.createElement('thead', props),
  TableBody: (props: any) => React.createElement('tbody', props),
  TableRow: (props: any) => React.createElement('tr', props),
  TableCell: (props: any) => React.createElement('td', props),
  TableHead: (props: any) => React.createElement('th', props),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: (props: any) => React.createElement('span', props),
}));

// default mock data (can be mutated by individual tests)
let mockData: any[] = [
  {
    id: '1',
    user: { display_name: 'Bob', email: 'bob@example.com' },
    event: { title: 'Test Event', start_ts: '2025-11-01T10:00:00Z' },
    ticket_type: { name: 'VIP', kind: 'paid' },
    registration_status: 'confirmed',
    created_at: '2025-10-01T00:00:00Z',
  },
];

// Provide a dynamic order implementation that tests can swap out.
let orderImpl: () => Promise<{ data: any[] | null; error: any | null }> = () =>
  Promise.resolve({ data: mockData, error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => orderImpl(),
      }),
    }),
  },
}));

import RegistrationsList from '../../RegistrationsList';

afterEach(() => {
  // reset to default behaviour between tests
  mockData = [
    {
      id: '1',
      user: { display_name: 'Bob', email: 'bob@example.com' },
      event: { title: 'Test Event', start_ts: '2025-11-01T10:00:00Z' },
      ticket_type: { name: 'VIP', kind: 'paid' },
      registration_status: 'confirmed',
      created_at: '2025-10-01T00:00:00Z',
    },
  ];
  orderImpl = () => Promise.resolve({ data: mockData, error: null });
  vi.clearAllMocks();
});

describe('RegistrationsList', () => {
  it('renders registration rows and fields', async () => {
    render(React.createElement(RegistrationsList));

    // participant name and email
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();

    // event title and ticket
    expect(screen.getByText('Test Event')).toBeInTheDocument();
    expect(screen.getByText('VIP')).toBeInTheDocument();

    // registration status
    expect(screen.getByText('confirmed')).toBeInTheDocument();

    // verify formatted dates (use same date-fns format as component)
    const registered = format(new Date(mockData[0].created_at), 'PP');
    expect(screen.getByText(registered)).toBeInTheDocument();

    const eventDate = format(new Date(mockData[0].event.start_ts), 'PPp');
    expect(screen.getByText(eventDate)).toBeInTheDocument();
  });

  it('renders checked-in time when present', async () => {
    mockData = [
      {
        id: '2',
        user: { display_name: 'Carol', email: 'carol@example.com' },
        event: { title: 'Checked In Event', start_ts: '2025-11-02T08:00:00Z' },
        ticket_type: { name: 'Standard', kind: 'free' },
        registration_status: 'attended',
        created_at: '2025-10-02T00:00:00Z',
      },
    ];

    // ensure orderImpl returns the updated mockData
    orderImpl = () => Promise.resolve({ data: mockData, error: null });

    render(React.createElement(RegistrationsList));

    expect(await screen.findByText('Carol')).toBeInTheDocument();
    
    // Verify the attended status badge is shown
    expect(screen.getByText('attended')).toBeInTheDocument();

    // Verify the event and date are displayed
    expect(screen.getByText('Checked In Event')).toBeInTheDocument();
    const eventDate = format(new Date(mockData[0].event.start_ts), 'PPp');
    expect(screen.getByText(eventDate)).toBeInTheDocument();
  });

  it('renders empty state when no registrations', async () => {
    mockData = [];
    orderImpl = () => Promise.resolve({ data: mockData, error: null });

    render(React.createElement(RegistrationsList));

    expect(await screen.findByText(/No registrations yet/i)).toBeInTheDocument();
  });

  it('shows loading state while fetching', async () => {
    // create a deferred promise so we can assert the loading state before it resolves
    let resolveFetch: (v: any) => void;
    const deferred = new Promise((res) => {
      resolveFetch = res;
    });
    orderImpl = () => deferred as Promise<{ data: any[]; error: null }>;

    render(React.createElement(RegistrationsList));

    // loading text should be visible immediately
    expect(screen.getByText(/Loading registrations/i)).toBeInTheDocument();

    // now resolve the fetch and wait for the empty state
    resolveFetch!({ data: [], error: null });
    await waitFor(() => expect(screen.queryByText(/Loading registrations/i)).not.toBeInTheDocument());
    expect(screen.getByText(/No registrations yet/i)).toBeInTheDocument();
  });
});
