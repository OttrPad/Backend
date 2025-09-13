/// <reference types="jest" />

// Additional Jest type declarations for our test environment
declare global {
  namespace jest {
    interface Matchers<R> {
      toMatchObject(expected: any): R;
      toHaveLength(length: number): R;
      toBeDefined(): R;
      toBeNull(): R;
      toBe(expected: any): R;
      toBeGreaterThan(expected: number): R;
      toBeGreaterThanOrEqual(expected: number): R;
      toBeTruthy(): R;
      not: Matchers<R>;
    }
  }

  // Jest globals
  const describe: jest.Describe;
  const it: jest.It;
  const test: jest.It;
  const expect: jest.Expect;
  const beforeAll: jest.Lifecycle;
  const afterAll: jest.Lifecycle;
  const beforeEach: jest.Lifecycle;
  const afterEach: jest.Lifecycle;
}

export {};
