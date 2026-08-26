/**
 * Test setup file
 * Sets up environment variables and global test configuration
 */

// Set required environment variables for tests
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.CLIENT_AUTH_TOKEN = 'test-client-token-12345';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.SCREENSHOT_STORAGE_PATH = './test-screenshots';
process.env.SCREENSHOT_TTL_DAYS = '30';
process.env.PORT = '3000';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
