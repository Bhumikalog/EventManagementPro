import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import EventManager from "../../EventManager";
import { AuthProvider } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ✅ Mock Supabase client (so no real API calls happen)
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

const baseInsertResponse = { data: { id: 3, title: "New Event" }, error: null };
const baseDeleteResponse = { error: null };
const baseTicketResponse = { error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table) => {
      const mockSelect = vi.fn(() => ({
        order: vi.fn(() =>
          Promise.resolve({
            data: [
              { 
                id: 1, 
                title: "Mock Event 1", 
                description: "Description 1",
                start_ts: new Date().toISOString(),
                end_ts: new Date(Date.now() + 3600000).toISOString()
              },
              { 
                id: 2, 
                title: "Mock Event 2", 
                description: "Description 2",
                start_ts: new Date().toISOString(),
                end_ts: new Date(Date.now() + 3600000).toISOString()
              },
            ],
            error: null,
          })
        ),
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            order: vi.fn(() =>
              Promise.resolve({
                data: [
                  { 
                    id: 1, 
                    title: "Mock Event 1", 
                    description: "Description 1",
                    start_ts: new Date().toISOString(),
                    end_ts: new Date(Date.now() + 3600000).toISOString()
                  },
                  { 
                    id: 2, 
                    title: "Mock Event 2", 
                    description: "Description 2",
                    start_ts: new Date().toISOString(),
                    end_ts: new Date(Date.now() + 3600000).toISOString()
                  },
                ],
                error: null,
              })
            ),
          })),
        })),
        in: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() =>
              Promise.resolve({
                data: [],
                error: null,
              })
            ),
          })),
        })),
      }));

      const mockInsert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve(baseInsertResponse))
        }))
      }));

      const mockDelete = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve(baseDeleteResponse))
      }));

      if (table === 'ticket_types') {
        return {
          insert: vi.fn(() => Promise.resolve(baseTicketResponse)),
          select: mockSelect,
          delete: mockDelete,
        };
      }

      return {
        select: mockSelect,
        insert: mockInsert,
        delete: mockDelete
      };
    }),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'mock-user-id' } } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn((callback) => {
        // Simulate calling the callback with null event and null session
        callback(null, null);
        // Return unsubscribe function
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      })
    }
  }
}));

// ✅ Mock useAuth hook to prevent "must be used within AuthProvider" error
vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<any>("@/contexts/AuthContext");
  return {
    ...actual,
    useAuth: vi.fn(() => ({
      user: { id: "mock-user" },
      signOut: vi.fn(),
    })),
  };
});

describe("EventManager Component", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });
  it("renders EventManager without crashing", async () => {
    render(
      <div id="sonner-toaster">
        <AuthProvider>
          <EventManager onUpdate={() => {}} />
        </AuthProvider>
      </div>
    );

    expect(await screen.findByText("Mock Event 1")).toBeInTheDocument();
    expect(await screen.findByText("Mock Event 2")).toBeInTheDocument();
  });

  it("renders event title and description", async () => {
    render(
      <div id="sonner-toaster">
        <AuthProvider>
          <EventManager onUpdate={() => {}} />
        </AuthProvider>
      </div>
    );

    expect(await screen.findByText("Mock Event 1")).toBeInTheDocument();
    expect(await screen.findByText("Description 1")).toBeInTheDocument();
  });

  it("handles button click events", async () => {
    render(
      <div id="sonner-toaster">
        <AuthProvider>
          <EventManager onUpdate={() => {}} />
        </AuthProvider>
      </div>
    );

    const eventTitle = await screen.findByText("Mock Event 1");
    expect(eventTitle).toBeInTheDocument();

    const button = screen.getByRole("button", { name: /create event/i });
    fireEvent.click(button);

    // There are multiple mocked events; assert that at least one is present after the click.
    const items = await screen.findAllByText(/mock event/i);
    expect(items.length).toBeGreaterThan(0);
  });

  it("creates a new event successfully", async () => {
    render(
      <div id="sonner-toaster">
        <AuthProvider>
          <EventManager onUpdate={() => {}} />
        </AuthProvider>
      </div>
    );

    // Open create event dialog
    const createButton = screen.getByRole("button", { name: /create event/i });
    fireEvent.click(createButton);

    // Fill out the form
    const titleInput = screen.getByLabelText(/event title/i);
    const descriptionInput = screen.getByLabelText(/description/i);
    const startDateInput = screen.getByLabelText(/start date/i);
    const startTimeInput = screen.getByLabelText(/start time/i);
    const endDateInput = screen.getByLabelText(/end date/i);
    const endTimeInput = screen.getByLabelText(/end time/i);

    fireEvent.change(titleInput, { target: { value: "New Test Event" } });
    fireEvent.change(descriptionInput, { target: { value: "Test Description" } });
    fireEvent.change(startDateInput, { target: { value: "2025-12-01" } });
    fireEvent.change(startTimeInput, { target: { value: "10:00" } });
    fireEvent.change(endDateInput, { target: { value: "2025-12-01" } });
    fireEvent.change(endTimeInput, { target: { value: "11:00" } });

    // Submit the form
    const submitButton = screen.getByRole("button", { name: /create event$/i });
    await fireEvent.click(submitButton);

    // Verify the form submitted successfully
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Event created successfully");
    });
  });

  it("deletes an event after confirmation", async () => {
    // Mock window.confirm to return true
    const confirmSpy = vi.spyOn(window, "confirm");
    confirmSpy.mockImplementation(() => true);

    render(
      <div id="sonner-toaster">
        <AuthProvider>
          <EventManager onUpdate={() => {}} />
        </AuthProvider>
      </div>
    );

    // Wait for events to load
    await screen.findByText("Mock Event 1");

    // Find delete button by finding the trash icon button (second button in the group)
    const allButtons = screen.getAllByRole("button");
    // The delete buttons are icon buttons (no accessible name), get all and find ones with trash icons
    const deleteButtons = allButtons.filter(button => {
      const svg = button.querySelector('svg[class*="trash"]');
      return svg !== null;
    });
    
    expect(deleteButtons.length).toBeGreaterThan(0);
    await fireEvent.click(deleteButtons[0]);

    // Verify confirm was called
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Are you sure you want to delete this event?"));

    // Verify deletion was successful
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("deleted"));
    });

    // Cleanup
    confirmSpy.mockRestore();
  });

  it("cancels event deletion when user declines confirmation", async () => {
    // Mock window.confirm to return false
    const confirmSpy = vi.spyOn(window, "confirm");
    confirmSpy.mockImplementation(() => false);

    render(
      <div id="sonner-toaster">
        <AuthProvider>
          <EventManager onUpdate={() => {}} />
        </AuthProvider>
      </div>
    );

    // Wait for events to load
    await screen.findByText("Mock Event 1");

    // Find delete button by finding the trash icon button
    const allButtons = screen.getAllByRole("button");
    const deleteButtons = allButtons.filter(button => {
      const svg = button.querySelector('svg[class*="trash"]');
      return svg !== null;
    });
    
    expect(deleteButtons.length).toBeGreaterThan(0);
    await fireEvent.click(deleteButtons[0]);

    // Verify confirm was called
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Are you sure you want to delete this event?"));

    // Verify event is still in the list
    expect(screen.getByText("Mock Event 1")).toBeInTheDocument();

    // Cleanup
    confirmSpy.mockRestore();
  });
});
