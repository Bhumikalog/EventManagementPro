import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import { useLocation, useNavigate } from 'react-router-dom';
import TicketSuccess from './TicketSuccess';
import { supabase } from '@/integrations/supabase/client';

// Mock dependencies
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: vi.fn(),
    useLocation: vi.fn(),
  };
});

// --- START OF FIX 3 ---
// A more robust mock for the supabase client query chain
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(), // We will mock its return value in beforeEach
    auth: {
      getSession: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));
// --- END OF FIX 3 ---

// Mock the react-qr-code component
vi.mock('react-qr-code', () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="mock-qr-code">{value}</div>
  ),
}));

const mockNavigate = vi.fn();

// --- START OF FIX 3 (continued) ---
// Define mocks for the Supabase query chain
const singleMock = vi.fn();
const eqMock = vi.fn(() => ({ single: singleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
// --- END OF FIX 3 (continued) ---

describe('TicketSuccess Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useNavigate as Mock).mockReturnValue(mockNavigate);
    
    // --- START OF FIX 3 (continued) ---
    // Reset mocks before each test
    singleMock.mockReset();
    eqMock.mockClear();
    selectMock.mockClear();
    // Point supabase.from to return the start of our chain
    (supabase.from as Mock).mockReturnValue({ select: selectMock });
    // --- END OF FIX 3 (continued) ---
  });

  it('renders QR code and details from location state', async () => {
    const mockQrData = JSON.stringify({ order_id: 'ord_123', event_id: 'evt_123' });
    const mockLocation = {
      state: {
        orderId: 'ord_123',
        qrCodeData: mockQrData,
      },
    };
    (useLocation as Mock).mockReturnValue(mockLocation);

    // Mock the fetch request
    const mockOrderDetails = {
      id: 'ord_123',
      amount: 100,
      qr_code_data: mockQrData,
      events: {
        title: 'Test Event from State',
        start_ts: new Date().toISOString(),
        venue_name: 'Venue A',
      },
      ticket_types: {
        name: 'Ticket from State',
      },
    };
    // --- START OF FIX 3 (continued) ---
    // Set the resolved value for this test
    singleMock.mockResolvedValue({ data: mockOrderDetails, error: null });
    // --- END OF FIX 3 (continued) ---

    render(<TicketSuccess />);

    // Wait for the component to finish loading and render the text
    expect(await screen.findByText('Payment Successful!')).toBeInTheDocument();

    // Check that the QR code is rendered with the data from location.state
    const qrCodeElement = screen.getByTestId('mock-qr-code');
    expect(qrCodeElement).toBeInTheDocument();
    expect(qrCodeElement.textContent).toBe(mockQrData);
    
    // Check that the fetch was still called
    expect(supabase.from).toHaveBeenCalledWith('orders');
    expect(selectMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith('id', 'ord_123');
    expect(singleMock).toHaveBeenCalled();
  });

  it('fetches order details and renders QR on page reload (no state.qrCodeData)', async () => {
    const mockFetchedQrData = JSON.stringify({ order_id: 'ord_456', event_id: 'evt_456' });
    const mockLocation = {
      state: {
        orderId: 'ord_456', // Only orderId is present
        qrCodeData: null,
      },
    };
    (useLocation as Mock).mockReturnValue(mockLocation);

    // Mock the fetch request
    const mockOrderDetails = {
      id: 'ord_456',
      amount: 200,
      qr_code_data: mockFetchedQrData,
      events: {
        title: 'Test Event from Fetch',
        start_ts: new Date().toISOString(),
        venue_name: 'Venue B',
        venue_location: 'Floor 2'
      },
      ticket_types: {
        name: 'Ticket from Fetch',
      },
    };
    // --- START OF FIX 3 (continued) ---
    // Set the resolved value for this test
    singleMock.mockResolvedValue({ data: mockOrderDetails, error: null });
    // --- END OF FIX 3 (continued) ---

    render(<TicketSuccess />);

    // Wait for the QR code to appear after the fetch
    const qrCodeElement = await screen.findByTestId('mock-qr-code');
    
    expect(qrCodeElement).toBeInTheDocument();
    expect(qrCodeElement.textContent).toBe(mockFetchedQrData);

    // Check that event details are rendered from the fetch
    expect(screen.getByText('Test Event from Fetch')).toBeInTheDocument();
    expect(screen.getByText('Ticket from Fetch')).toBeInTheDocument();
    expect(screen.getByText('Venue B, Floor 2')).toBeInTheDocument();
    expect(screen.getByText('₹200')).toBeInTheDocument();
    
    // Check that the fetch was called
    expect(supabase.from).toHaveBeenCalledWith('orders');
    expect(selectMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith('id', 'ord_456');
    expect(singleMock).toHaveBeenCalled();
  });

  it('navigates to home if orderId is missing', () => {
    (useLocation as Mock).mockReturnValue({ state: null });
    render(<TicketSuccess />);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});