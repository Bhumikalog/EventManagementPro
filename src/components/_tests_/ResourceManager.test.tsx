// src/components/resource-management/ResourceManager.test.tsx

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ResourceManager } from './ResourceManager';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';

// --- Mocks ---

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock useToast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: 'fake-token' } } })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'user-123' } } })),
    },
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn(() => ({
          unsubscribe: vi.fn(),
        })),
      })),
    })),
    removeChannel: vi.fn(),
  },
}));

// Mock window.confirm for delete tests
window.confirm = vi.fn(() => true);

// --- Test Suite ---

describe('ResourceManager', () => {
  const user = userEvent.setup();
  const mockUiToast = vi.fn();

  // Helper mocks
  const mockFrom = supabase.from as vi.Mock;
  const mockSelect = vi.fn();
  const mockOrder = vi.fn();
  const mockIn = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockEq = vi.fn();

  const mockResources = [
    { id: 'res-1', name: 'Conference Hall A', type: 'hall', status: 'available', location: 'Building 1', capacity: 100, created_at: new Date().toISOString() },
    { id: 'res-2', name: 'Projector 1', type: 'Equipment', status: 'available', location: 'IT', capacity: 1, created_at: new Date().toISOString() },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useToast as vi.Mock).mockReturnValue({ toast: mockUiToast });

    // Setup chained Supabase mocks
    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
    });
    mockSelect.mockReturnValue({
      order: mockOrder,
      in: mockIn,
      eq: mockEq,
    });
    mockOrder.mockResolvedValue({ data: mockResources, error: null });
    mockIn.mockResolvedValue({ data: [], error: null }); // For allocations
    mockEq.mockReturnValue({
      order: mockOrder
    });
  });

  it('loads and displays existing resources', async () => {
    mockFrom.mockImplementation((tableName) => {
      if (tableName === 'resources') {
        return { select: () => ({ order: () => Promise.resolve({ data: mockResources, error: null }) }) };
      }
      if (tableName === 'resource_allocations') {
        return { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) };
      }
      return { select: () => ({}) }; // Default fallback
    });

    render(<ResourceManager />);

    expect(await screen.findByText('Conference Hall A')).toBeInTheDocument();
    expect(screen.getByText('Projector 1')).toBeInTheDocument();
    expect(screen.getAllByText('available').length).toBeGreaterThan(0);
  });

  it('opens the dialog to create a new resource and submits', async () => {
    mockInsert.mockResolvedValue({ error: null }); // Mock insert success
    
    // Mock loadResources to return an empty array initially
    mockOrder.mockResolvedValueOnce({ data: [], error: null });
    // Mock loadResources to return the new item after creation
    mockOrder.mockResolvedValueOnce({ data: [{ ...mockResources[0], name: 'New Room' }], error: null });

    render(<ResourceManager />);

    // Click "Add Resource"
    await user.click(screen.getByRole('button', { name: /Add Resource/i }));

    // Dialog opens
    expect(await screen.findByRole('heading', { name: /Create Resource/i })).toBeInTheDocument();

    // Fill the form
    await user.type(screen.getByLabelText('Resource Name'), 'New Room');
    await user.type(screen.getByLabelText('Location'), 'Building 3');
    await user.type(screen.getByLabelText('Capacity'), '50');

    // Submit
    await user.click(screen.getByRole('button', { name: /Create/i }));

    // Assertions
    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Room',
        location: 'Building 3',
        capacity: 50,
        status: 'available',
      }));
    });
    
    expect(sonnerToast.success).toHaveBeenCalledWith('Resource created successfully');
    expect(await screen.findByText('New Room')).toBeInTheDocument(); // Verify UI updated
  });

  it('opens the dialog to edit an existing resource', async () => {
    mockUpdate.mockResolvedValue({ error: null });
    mockOrder.mockResolvedValue({ data: mockResources, error: null });

    render(<ResourceManager />);
    
    expect(await screen.findByText('Conference Hall A')).toBeInTheDocument();

    // Click the first "Edit" button
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    // Dialog opens with correct title
    expect(await screen.findByRole('heading', { name: /Edit Resource/i })).toBeInTheDocument();

    // Form fields should be pre-filled
    const nameInput = screen.getByLabelText('Resource Name');
    expect(nameInput).toHaveValue('Conference Hall A');

    // Edit the form
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Hall');

    // Submit
    await user.click(screen.getByRole('button', { name: /Update/i }));

    // Assertions
    await waitFor(() => {
       expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Renamed Hall',
      }));
    });
    expect(sonnerToast.success).toHaveBeenCalledWith('Resource updated successfully');
  });
  
  it('deletes a resource after confirmation', async () => {
    mockDelete.mockResolvedValue({ error: null });
    mockOrder.mockResolvedValue({ data: mockResources, error: null });

    render(<ResourceManager />);

    expect(await screen.findByText('Conference Hall A')).toBeInTheDocument();

    // Click the first "Delete" button
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    // Assertions
    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this resource?');
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled();
    });
    expect(sonnerToast.success).toHaveBeenCalledWith('Resource deleted');
  });

  it('shows an error message if resources table does not exist', async () => {
    // Mock the error response for "relation does not exist"
    mockOrder.mockResolvedValue({ 
      data: null, 
      error: { message: 'relation "public.resources" does not exist' } 
    });

    render(<ResourceManager />);

    expect(await screen.findByText(/Resources table not found/i)).toBeInTheDocument();
    expect(screen.getByText(/Please apply the DB migrations/i)).toBeInTheDocument();
    expect(screen.queryByText('Conference Hall A')).not.toBeInTheDocument();
  });
});