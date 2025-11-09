import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { WaitlistManagement } from '../WaitlistManagement';

vi.mock('@/hooks/useWaitlist', () => ({
  useWaitlist: () => ({
    waitlist: [
      {
        id: '1',
        profiles: {
          display_name: 'Alice',
          email: 'alice@example.com',
        },
        phone: '1234567890',
        waitlist_position: 1,
        registration_timestamp: '2025-11-01T12:00:00Z',
      },
    ],
    loading: false,
    addToWaitlist: vi.fn(),
    promoteFromWaitlist: vi.fn(),
    removeFromWaitlist: vi.fn(),
    refreshWaitlist: vi.fn(),
  }),
}));

describe('WaitlistManagement', () => {
  it('renders waitlist count and attendee details correctly', () => {
    render(<WaitlistManagement />);

    // ✅ Check waitlist count
    expect(screen.getByText(/waitlist management \(1\)/i)).toBeInTheDocument();

    // ✅ Check heading for name (avoids multiple matches)
    const nameHeading = screen.getByRole('heading', { name: /alice/i });
    expect(nameHeading).toBeInTheDocument();

    // ✅ Check email
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();

    // ✅ Check position badge
    expect(screen.getByText(/#1/)).toBeInTheDocument();
  });
});
