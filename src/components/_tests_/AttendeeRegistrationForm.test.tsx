import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, beforeEach, expect } from 'vitest';

// ✅ Mock the useAttendees hook
const registerMock = vi.fn();

vi.mock('@/hooks/useAttendees', () => ({
  useAttendees: () => ({
    registerAttendee: registerMock,
    loading: false,
  }),
}));

import { AttendeeRegistrationForm } from '../AttendeeRegistrationForm';

describe('AttendeeRegistrationForm', () => {
  beforeEach(() => {
    registerMock.mockReset();
  });

  it('renders the form and submits required fields', async () => {
    registerMock.mockResolvedValue({ success: true });

    render(<AttendeeRegistrationForm />);

    const nameInput = screen.getByPlaceholderText('Full Name');
    const emailInput = screen.getByPlaceholderText('Email');
    const submitButton = screen.getByRole('button', { name: /register attendee/i });

    await userEvent.type(nameInput, 'Test User');
    await userEvent.type(emailInput, 'test@example.com');
    await userEvent.click(submitButton);

    // ✅ Assert the hook was called
    expect(registerMock).toHaveBeenCalled();

    // ✅ Assert the correct data was passed
    expect(registerMock.mock.calls[0][0]).toMatchObject({
      name: 'Test User',
      email: 'test@example.com',
    });

    // ✅ (Optional) Check inputs are cleared after success
    expect(nameInput).toHaveValue('');
    expect(emailInput).toHaveValue('');
  });

  it('does not submit when required fields are empty', async () => {
    render(<AttendeeRegistrationForm />);

    const submitButton = screen.getByRole('button', { name: /register attendee/i });
    await userEvent.click(submitButton);

    // ✅ Hook should not be called when inputs are empty
    expect(registerMock).not.toHaveBeenCalled();
  });
});
