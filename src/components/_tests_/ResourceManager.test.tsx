// src/components/_tests_/ResourceManager.test.tsx

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
// Note: Adjust this import path if your component is elsewhere
import { ResourceManager } from '../resource-management/ResourceManager';
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
  useToast: vi.fn(),
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
      limit: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'evt-1' }, error: null }) })),
    });
    mockOrder.mockResolvedValue({ data: mockResources, error: null });
    mockIn.mockResolvedValue({ data: [], error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockDelete.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ error: null });
  });

  it('loads and displays existing resources', async () => {
    mockFrom.mockImplementation((tableName) => {
      if (tableName === 'resources') {
        const orderMock = vi.fn().mockResolvedValue({ data: mockResources, error: null });
        const selectMock = vi.fn().mockReturnValue({ order: orderMock });
        return { select: selectMock };
      }
      if (tableName === 'resource_allocations') {
        const inMock = vi.fn().mockResolvedValue({ data: [], error: null });
        const selectMock = vi.fn().mockReturnValue({ in: inMock });
        return { select: selectMock };
      }
      return { select: vi.fn(() => ({})) }; 
    });

    render(<ResourceManager />);

    expect(await screen.findByText('Conference Hall A')).toBeInTheDocument();
    expect(screen.getByText('Projector 1')).toBeInTheDocument();
  });

  it('opens the dialog to create a new resource and submits', async () => {
    mockInsert.mockResolvedValue({ error: null });
    
    mockOrder.mockResolvedValueOnce({ data: [], error: null });
    const newResource = { ...mockResources[0], name: 'New Room', location: 'Building 3', capacity: 50 };
    mockOrder.mockResolvedValueOnce({ data: [newResource], error: null });

    render(<ResourceManager />);

    await user.click(screen.getByRole('button', { name: /Add Resource/i }));
    expect(await screen.findByRole('heading', { name: /Create Resource/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Resource Name'), 'New Room');
    await user.type(screen.getByLabelText('Location'), 'Building 3');
    await user.clear(screen.getByLabelText('Capacity'));
    await user.type(screen.getByLabelText('Capacity'), '50');

    await user.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Room',
        capacity: 50,
      }));
    });
    
    expect(sonnerToast.success).toHaveBeenCalledWith('Resource created successfully');
    expect(await screen.findByText('New Room')).toBeInTheDocument();
  });

  it('opens the dialog to edit an existing resource', async () => {
    mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockOrder.mockResolvedValue({ data: mockResources, error: null });

    render(<ResourceManager />);
    
    expect(await screen.findByText('Conference Hall A')).toBeInTheDocument();

    const row = screen.getByText('Conference Hall A').closest('tr');
    const editButton = within(row).getAllByRole('button')[0];
    
    await user.click(editButton);

    expect(await screen.findByRole('heading', { name: /Edit Resource/i })).toBeInTheDocument();
    const nameInput = screen.getByLabelText('Resource Name');
    expect(nameInput).toHaveValue('Conference Hall A');

    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Hall');
    await user.click(screen.getByRole('button', { name: /Update/i }));

    await waitFor(() => {
       expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Renamed Hall',
      }));
    });
    expect(sonnerToast.success).toHaveBeenCalledWith('Resource updated successfully');
  });
  
  it('deletes a resource after confirmation', async () => {
    mockDelete.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mockOrder.mockResolvedValue({ data: mockResources, error: null });

    render(<ResourceManager />);

    expect(await screen.findByText('Conference Hall A')).toBeInTheDocument();

    const row = screen.getByText('Conference Hall A').closest('tr');
    const deleteButton = within(row).getAllByRole('button')[1];
    
    await user.click(deleteButton);

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to delete this resource?');
    await waitFor(() => {
      expect(mockDelete().eq).toHaveBeenCalledWith('id', mockResources[0].id);
    });
    expect(sonnerToast.success).toHaveBeenCalledWith('Resource deleted');
  });

  it('shows an error message if resources table does not exist', async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        order: () => Promise.resolve({ 
          data: null, 
          error: { message: 'relation "public.resources" does not exist' } 
        })
      })
    });

    render(<ResourceManager />);

    expect(await screen.findByText(/Resources table not found/i)).toBeInTheDocument();
  });
});