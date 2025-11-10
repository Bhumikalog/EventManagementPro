// src/components/resource-management/CheckInSystem.test.tsx

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CheckInSystem } from './CheckInSystem';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import jsQR from 'jsqr';

// --- Mocks ---

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(),
          limit: vi.fn(() => ({
            data: [],
            error: null,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          data: null,
          error: null,
        })),
      })),
      insert: vi.fn(() => ({
        data: null,
        error: null,
      })),
    })),
    // Mock other Supabase methods if needed
  },
}));

// Mock jsQR
vi.mock('jsqr', () => ({
  default: vi.fn(),
}));

// Mock Browser APIs used in readImageFile
beforeEach(() => {
  // Mock Canvas API
  window.HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
    getImageData: () => ({
      data: new Uint8ClampedArray([1, 2, 3]), // Dummy image data
      width: 100,
      height: 100,
    }),
  })) as any;

  // Mock FileReader
  vi.spyOn(window, 'FileReader').mockImplementation(() => ({
    readAsDataURL: vi.fn(function () {
      if (this.onload) {
        this.onload({ target: { result: 'fake-data-url' } } as ProgressEvent<FileReader>);
      }
    }),
    onload: null,
    onerror: null,
    result: 'fake-data-url',
  } as unknown as FileReader));

  // Mock Image onload
  vi.spyOn(window, 'Image').mockImplementation(() => {
    const img = {
      onload: null,
      onerror: null,
      src: '',
    };
    // Use setTimeout to simulate async loading
    setTimeout(() => {
      if (img.onload) {
        img.onload();
      }
    }, 0);
    return img as HTMLImageElement;
  });

  // Reset mocks before each test
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Test Suite ---

describe('CheckInSystem', () => {
  const user = userEvent.setup();
  const testFile = new File(['(⌐□_□)'], 'qr.png', { type: 'image/png' });

  // Helper function to mock Supabase chain
  const mockFrom = supabase.from as vi.Mock;
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockMaybeSingle = vi.fn();
  const mockUpdate = vi.fn();
  const mockInsert = vi.fn();
  const mockLimit = vi.fn();

  beforeEach(() => {
    mockFrom.mockReturnValue({
      select: mockSelect,
      update: mockUpdate,
      insert: mockInsert,
    });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({
      maybeSingle: mockMaybeSingle,
      limit: mockLimit,
    });
    mockLimit.mockResolvedValue({ data: [], error: null });
    mockUpdate.mockResolvedValue({ error: null });
    mockInsert.mockResolvedValue({ error: null });
    mockEq.mockResolvedValue({ error: null });
  });

  it('renders the component and file upload button', () => {
    render(<CheckInSystem />);
    expect(screen.getByText('QR Code Check-In System')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Select QR Code Image/i })).toBeInTheDocument();
  });

  it('handles a successful check-in for a direct registration (free ticket)', async () => {
    // 1. Mock QR decode
    (jsQR as vi.Mock).mockReturnValue({ data: JSON.stringify({ order_id: 'reg-free-123' }) });

    // 2. Mock Supabase response for direct registration lookup
    const mockRegistration = {
      id: 'reg-free-123',
      registration_status: 'confirmed',
      checked_in_at: null,
      user_id: 'user-1',
      event_id: 'event-1',
      user: { display_name: 'Test User', email: 'test@example.com' },
      event: { title: 'Test Event' },
      ticket_type: { name: 'Free Ticket' },
    };
    mockMaybeSingle.mockResolvedValueOnce({ data: mockRegistration, error: null }); // Direct reg check
    mockLimit.mockResolvedValue({ data: [], error: null }); // Existing check-in check

    render(<CheckInSystem />);

    // 3. Simulate file upload
    const fileInput = screen.getByTestId('qr-upload'); // We need to add data-testid="qr-upload" to the <input> in CheckInSystem.tsx
    // Since we can't edit the code, we'll find it by its hardcoded id
    // const fileInput = container.querySelector('#qr-upload');
    // userEvent.upload doesn't work well with hidden inputs, so we'll fireEvent
    
    // Let's find the button and trigger the input click, then fire change on the input
    const uploadButton = screen.getByRole('button', { name: /Select QR Code Image/i });
    const fileInputNode = uploadButton.previousSibling as HTMLInputElement; // Relies on DOM structure
    
    expect(fileInputNode.id).toBe('qr-upload'); // Verify we found the right node

    await fireEvent.change(fileInputNode, { target: { files: [testFile] } });
    
    // 4. Assertions
    await waitFor(() => {
      expect(screen.getByText('Check-in successful!')).toBeInTheDocument();
    });
    expect(screen.getByText('Name:')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Attendee checked in successfully!');
    expect(supabase.from('registrations').update).toHaveBeenCalledWith({ checked_in_at: expect.any(String) });
    expect(supabase.from('checkins').insert).toHaveBeenCalled();
  });

  it('handles a successful check-in for an order (paid ticket)', async () => {
    // 1. Mock QR decode
    (jsQR as vi.Mock).mockReturnValue({ data: JSON.stringify({ order_id: 'order-paid-456' }) });

    // 2. Mock Supabase responses
    const mockRegistration = {
      id: 'reg-789',
      registration_status: 'confirmed',
      checked_in_at: null,
      user: { display_name: 'Paid User' },
      event: { title: 'Paid Event' },
      ticket_type: { name: 'VIP Ticket' },
    };
    
    // First lookup (direct reg) fails
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null }); 
    // Second lookup (order) succeeds
    mockMaybeSingle.mockResolvedValueOnce({ data: { registration_id: 'reg-789' }, error: null });
    // Third lookup (reg by order) succeeds
    mockMaybeSingle.mockResolvedValueOnce({ data: mockRegistration, error: null });
    
    mockLimit.mockResolvedValue({ data: [], error: null }); // Existing check-in check

    render(<CheckInSystem />);
    const fileInputNode = screen.getByRole('button', { name: /Select QR Code Image/i }).previousSibling as HTMLInputElement;
    await fireEvent.change(fileInputNode, { target: { files: [testFile] } });

    // 4. Assertions
    await waitFor(() => {
      expect(screen.getByText('Check-in successful!')).toBeInTheDocument();
    });
    expect(screen.getByText('Paid User')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Attendee checked in successfully!');
    expect(supabase.from('registrations').update).toHaveBeenCalled();
  });

  it('shows an error if the QR code is invalid', async () => {
    // 1. Mock QR decode to fail
    (jsQR as vi.Mock).mockReturnValue(null);

    render(<CheckInSystem />);
    const fileInputNode = screen.getByRole('button', { name: /Select QR Code Image/i }).previousSibling as HTMLInputElement;
    await fireEvent.change(fileInputNode, { target: { files: [testFile] } });

    // 4. Assertions
    await waitFor(() => {
      expect(screen.getByText(/No QR code found in the image/i)).toBeInTheDocument();
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows an error if ticket is already checked in', async () => {
    // 1. Mock QR decode
    (jsQR as vi.Mock).mockReturnValue({ data: JSON.stringify({ order_id: 'reg-123' }) });
    
    // 2. Mock Supabase to return an already checked-in user
    const mockRegistration = {
      id: 'reg-123',
      registration_status: 'confirmed',
      checked_in_at: new Date().toISOString(), // Already checked in
      user: { display_name: 'Late User' },
    };
    mockMaybeSingle.mockResolvedValue({ data: mockRegistration, error: null });

    render(<CheckInSystem />);
    const fileInputNode = screen.getByRole('button', { name: /Select QR Code Image/i }).previousSibling as HTMLInputElement;
    await fireEvent.change(fileInputNode, { target: { files: [testFile] } });

    // 4. Assertions
    await waitFor(() => {
      expect(screen.getByText(/already been checked in/i)).toBeInTheDocument();
    });
    expect(toast.warning).toHaveBeenCalledWith('Already checked in');
    expect(supabase.from('registrations').update).not.toHaveBeenCalled();
  });
});