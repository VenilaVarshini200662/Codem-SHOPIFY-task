// tests/setup.js
import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { afterEach } from "vitest";

// Mock window methods
global.confirm = vi.fn(() => true);
global.alert = vi.fn();

// Mock fetch
global.fetch = vi.fn();

// Mock FormData globally
global.FormData = vi.fn(() => ({
  append: vi.fn(),
  get: vi.fn(),
  getAll: vi.fn(),
  has: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  entries: vi.fn(),
  keys: vi.fn(),
  values: vi.fn(),
  forEach: vi.fn(),
}));

// Clean up between tests
afterEach(() => {
  vi.clearAllMocks();
});