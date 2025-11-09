import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ✅ Mock browser APIs like localStorage for the Node (test) environment
if (typeof window !== 'undefined' && !window.localStorage) {
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
    writable: true,
  });
}

// ✅ Optional: Silence React act() warnings (helps keep test logs clean)
vi.spyOn(console, 'error').mockImplementation((msg) => {
  if (
    typeof msg === 'string' &&
    msg.includes('Warning: An update to') &&
    msg.includes('inside a test was not wrapped in act')
  ) {
    return;
  }
  console.error(msg);
});
