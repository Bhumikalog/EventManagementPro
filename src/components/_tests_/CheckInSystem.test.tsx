import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { vi, describe, it, beforeEach, expect } from "vitest";
import { CheckInSystem } from "../resource-management/CheckInSystem";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import jsQR from "jsqr";

// ---- MOCKS ----
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

vi.mock("jsqr", () => ({ default: vi.fn() }));

describe("CheckInSystem Component", () => {
  const testFile = new File(["(⌐□_□)"], "qr.png", { type: "image/png" });

  const mockFrom = supabase.from as vi.Mock;
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockMaybeSingle = vi.fn();
  const mockMatch = vi.fn();
  const mockInsert = vi.fn();
  const mockLimit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
    });

    mockSelect.mockReturnValue({
      eq: mockEq,
      match: mockMatch,
      maybeSingle: mockMaybeSingle,
      limit: mockLimit,
    });

    mockEq.mockReturnThis();
    mockMatch.mockReturnThis();
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockLimit.mockResolvedValue({ data: [], error: null });
    mockInsert.mockResolvedValue({ error: null });

    // Mock canvas
    window.HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
      getImageData: () => ({
        data: new Uint8ClampedArray([1, 2, 3]),
        width: 100,
        height: 100,
      }),
    })) as any;

    // Mock FileReader
    vi.spyOn(window, "FileReader").mockImplementation(function () {
      const self: any = this;
      self.readAsDataURL = vi.fn(() => {
        if (self.onload) self.onload({ target: { result: "fake-data-url" } });
      });
      return self;
    });

    // Mock Image
    vi.spyOn(window, "Image").mockImplementation(function () {
      const self: any = this;
      Object.defineProperty(self, "src", {
        set() {
          if (self.onload) self.onload();
        },
      });
      return self;
    });
  });

  it("renders Check-In UI correctly", () => {
    render(<CheckInSystem />);
    expect(screen.getByText(/QR Code Check-In System/i)).toBeInTheDocument();
    expect(screen.getByText(/Select QR Code Image/i)).toBeInTheDocument();
  });

  it("handles when no file is selected", async () => {
    render(<CheckInSystem />);
    const input = screen.getByTestId("qr-upload");
    await act(async () => {
      fireEvent.change(input, { target: { files: [] } });
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows error for invalid QR image", async () => {
    (jsQR as vi.Mock).mockReturnValue(null);
    render(<CheckInSystem />);
    const input = screen.getByTestId("qr-upload");
    await act(async () => {
      fireEvent.change(input, { target: { files: [testFile] } });
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("No QR code found in the image.")
    );
  });

  it("handles valid paid QR and checks in successfully", async () => {
    (jsQR as vi.Mock).mockReturnValue({
      data: JSON.stringify({ order_id: "o1", event_id: "e1", user_id: "u1" }),
    });

    mockMaybeSingle.mockResolvedValueOnce({
      data: { payment_status: "completed" },
      error: null,
    });

    render(<CheckInSystem />);
    const input = screen.getByTestId("qr-upload");
    await act(async () => {
      fireEvent.change(input, { target: { files: [testFile] } });
    });

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Attendee checked in successfully!"
      )
    );
  });

  it("shows already checked-in message", async () => {
    (jsQR as vi.Mock).mockReturnValue({
      data: JSON.stringify({ event_id: "e1", user_id: "u1" }),
    });
    mockLimit.mockResolvedValueOnce({ data: [{ id: 1 }], error: null });

    render(<CheckInSystem />);
    const input = screen.getByTestId("qr-upload");

    await act(async () => {
      fireEvent.change(input, { target: { files: [testFile] } });
    });

    await waitFor(() =>
      expect(screen.getByText(/already been checked in/i)).toBeInTheDocument()
    );
  });
});
