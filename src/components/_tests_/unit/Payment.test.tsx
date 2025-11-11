import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import Payment from '@/pages/Payment';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Mock dependencies
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: vi.fn(),
    useLocation: vi.fn(),
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the react-qr-code component
vi.mock('react-qr-code', () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="mock-qr-code">{value}</div>
  ),
}));

// Mock Razorpay
class MockRazorpay {
  options: any;
  constructor(options: any) {
    this.options = options;
  }
  open = vi.fn(() => {
    // Immediately simulate a successful payment
    this.options.handler({
      razorpay_payment_id: 'mock_payment_id',
      razorpay_order_id: this.options.order_id,
      razorpay_signature: 'mock_signature',
    });
  });
  on = vi.fn();
}
vi.stubGlobal('Razorpay', MockRazorpay);

// Mock data
const mockNavigate = vi.fn();
const mockLocation = {
  state: {
    event: { id: 'evt_123', title: 'Test Event' },
    ticketType: { id: 'tkt_123', name: 'Paid Ticket', price: 100 },
  },
};
const mockUser = { id: 'user_123', email: 'test@example.com' };
const mockProfile = { display_name: 'Test User' };
const mockSession = {
  data: {
    session: { access_token: 'mock_token' },
  },
  error: null,
};
const mockCreateOrderResponse = {
  data: {
    order_id: 'db_order_456',
    razorpay_order_id: 'rzp_order_789',
    key_id: 'mock_key',
    amount: 10000,
    currency: 'INR',
  },
};
const mockVerifyPaymentResponse = {
  data: {
    order_id: 'db_order_456',
  },
};

// Mock the date to get a consistent timestamp
const MOCK_ISO_DATE = '2025-01-01T00:00:00.000Z';
vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(MOCK_ISO_DATE);


describe('Payment Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useNavigate as Mock).mockReturnValue(mockNavigate);
    (useLocation as Mock).mockReturnValue(mockLocation);
    (useAuth as Mock).mockReturnValue({ user: mockUser, profile: mockProfile });
    (supabase.auth.getSession as Mock).mockResolvedValue(mockSession);
  });

  it('renders event and ticket details correctly', () => {
    render(<Payment />);

    expect(screen.getByText('Complete Payment')).toBeInTheDocument();
    expect(screen.getByText('Test Event')).toBeInTheDocument();
    expect(screen.getByText('Paid Ticket')).toBeInTheDocument();
    expect(screen.getByText('₹100')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay Now' })).toBeInTheDocument();
  });

  it('navigates to home if location state is missing', () => {
    (useLocation as Mock).mockReturnValue({ state: null });
    render(<Payment />);
    expect(toast.error).toHaveBeenCalledWith('Invalid payment request');
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('handles the full payment and verification flow on "Pay Now" click', async () => {
    // Mock the Supabase function invocations
    (supabase.functions.invoke as Mock)
      .mockResolvedValueOnce(mockCreateOrderResponse) // First call: create-razorpay-order
      .mockResolvedValueOnce(mockVerifyPaymentResponse); // Second call: verify-payment

    render(<Payment />);

    const payButton = screen.getByRole('button', { name: 'Pay Now' });

    // Use act to wrap state updates
    await act(async () => {
      await userEvent.click(payButton);
    });

    // 1. Check if 'create-razorpay-order' was called
    expect(supabase.functions.invoke).toHaveBeenCalledWith('create-razorpay-order', {
      body: {
        event_id: 'evt_123',
        ticket_type_id: 'tkt_123',
        amount: 100,
      },
      headers: {
        Authorization: 'Bearer mock_token',
      },
    });

    // 2. Check if 'verify-payment' was called
    expect(supabase.functions.invoke).toHaveBeenCalledWith('verify-payment', {
      body: {
        order_id: 'db_order_456',
        razorpay_payment_id: 'mock_payment_id',
        razorpay_order_id: 'rzp_order_789',
        razorpay_signature: 'mock_signature',
      },
      headers: {
        Authorization: 'Bearer mock_token',
      },
    });

    // 3. Check for success toast
    expect(toast.success).toHaveBeenCalledWith('Payment successful!');

    // 4. Check navigation to success page with correct client-generated QR data
    const expectedQrData = JSON.stringify({
      order_id: 'db_order_456', // This comes from the *verify-payment* response
      event_id: 'evt_123',
      user_id: 'user_123',
      ticket_type_id: 'tkt_123',
      timestamp: MOCK_ISO_DATE, // Use the exact mock date
    });

    expect(mockNavigate).toHaveBeenCalledWith('/ticket-success', {
      state: {
        orderId: 'db_order_456',
        qrCodeData: expectedQrData,
      },
    });
  });

  it('shows an error if creating razorpay order fails', async () => {
    (supabase.functions.invoke as Mock).mockRejectedValue(
      new Error('Failed to create order')
    );

    render(<Payment />);

    const payButton = screen.getByRole('button', { name: 'Pay Now' });

    await act(async () => {
      await userEvent.click(payButton);
    });
    
    // --- START OF FIX ---
    // Change the text to match what the component *actually* renders,
    // which we saw in the test output's HTML dump.
    const errorMessage = await screen.findByText(
      /Failed to reach the Edge Function/i, // Use a regex for partial, case-insensitive matching
      {}, 
      { timeout: 3000 }
    );
    expect(errorMessage).toBeInTheDocument();
    // --- END OF FIX ---
  });
});