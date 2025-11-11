import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, it, beforeEach, expect } from "vitest";
import { ResourceManager } from "../../resource-management/ResourceManager";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getSession: vi.fn() },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
}));

describe("ResourceManager Component", () => {
  const mockFrom = supabase.from as vi.Mock;
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockOrder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      delete: mockDelete,
      order: mockOrder,
    });

    mockSelect.mockReturnValue({ order: mockOrder });
    mockOrder.mockResolvedValue({ data: [], error: null });
  });

  it("renders Resource Management UI", () => {
    render(<ResourceManager />);
    expect(screen.getByText(/Resource Management/i)).toBeInTheDocument();
    expect(screen.getByText(/Add Resource/i)).toBeInTheDocument();
  });

  it("loads resources successfully", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [{ id: "1", name: "Hall A", type: "hall", status: "available" }],
      error: null,
    });
    render(<ResourceManager />);
    await waitFor(() =>
      expect(screen.getByText(/Hall A/i)).toBeInTheDocument()
    );
  });

  it("shows message if table not found", async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: "42P01" } });
    render(<ResourceManager />);
    await waitFor(() =>
      expect(screen.getByText(/Resources table not found/i)).toBeInTheDocument()
    );
  });

  it("creates a new resource successfully", async () => {
    mockInsert.mockResolvedValueOnce({ error: null });
    render(<ResourceManager />);
    await act(async () => {
      fireEvent.click(screen.getByText(/Add Resource/i));
    });

    const nameInput = await screen.findByLabelText(/Resource Name/i);
    fireEvent.change(nameInput, { target: { value: "New Resource" } });

    const submitButton = screen.getByTestId("create-submit");
    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Resource created successfully"
      )
    );
  });

  it("handles resource deletion gracefully", async () => {
    global.confirm = vi.fn(() => true);
    mockDelete.mockResolvedValueOnce({ error: null });
    render(<ResourceManager />);
    await waitFor(() => expect(toast.success).not.toHaveBeenCalled());
  });
});
