// Test setup file
import { config } from "dotenv";

// Load test environment variables
config({ path: "../../.env.test" });
// Also try loading from the main .env file as fallback
config({ path: "../../.env" });

// Set default test environment variables
process.env.SUPABASE_JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET || "test-jwt-secret-key-for-testing-12345";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.COLLABORATION_HTTP_PORT = "0"; // Use random port for tests

// Increase timeout for Socket.IO operations
jest.setTimeout(30000);

// Add global test utilities if needed
declare global {
  namespace NodeJS {
    interface Global {
      __TEST_ENV__: boolean;
    }
  }
}

// Mark as test environment
(global as any).__TEST_ENV__ = true;
