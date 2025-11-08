-- Add 'waitlisted' to registration_status enum
ALTER TYPE registration_status ADD VALUE IF NOT EXISTS 'waitlisted';