// Jest setup file for global test configuration

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock environment variables
process.env.BASE_REDIRECT_URL = 'https://test.example.com/r';

// Global test timeout
jest.setTimeout(10000);