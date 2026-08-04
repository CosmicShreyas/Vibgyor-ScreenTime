/**
 * Property-based tests for cleanup service
 * Feature: vibgyorseek-employee-monitoring
 * 
 * Property 19: Screenshot TTL Deletion
 * For any screenshot where the current time minus the creation timestamp exceeds 
 * the configured Screenshot_TTL period, the cleanup process should delete both 
 * the file and the database reference.
 * 
 * Property 20: Screenshot Deletion Logging
 * For any screenshot deleted by the cleanup process, a log entry should be created 
 * documenting the deletion with the screenshot ID and employee name.
 * 
 * Validates: Requirements 12.4, 12.5
 */

import * as fc from 'fast-check';
import { CleanupService } from '../cleanup.service';
import { database } from '../../utils/database';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import fs from 'fs';
import path from 'path';

// Mock dependencies
jest.mock('../../utils/database');
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    stop: jest.fn(),
  })),
}));

describe('Cleanup Service - Property-Based Tests', () => {
  let cleanupService: CleanupService;
  const testStoragePath = path.join(__dirname, 'test-cleanup-properties');
  let mockQuery: jest.Mock;

  beforeEach(() => {
    cleanupService = new CleanupService();
    mockQuery = database.query as jest.Mock;
    mockQuery.mockClear();
    jest.clearAllMocks();
    
    // Override config for testing
    (config as any).screenshotStoragePath = testStoragePath;
    (config as any).screenshotTtlDays = 30;
  });

  afterEach(async () => {
    cleanupService.stop();
    
    // Clean up test files
    try {
      if (fs.existsSync(testStoragePath)) {
        fs.rmSync(testStoragePath, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Property 19: Screenshot TTL Deletion', () => {
    /**
     * **Validates: Requirements 12.4**
     * 
     * Property: For any screenshot where the current time minus the creation timestamp 
     * exceeds the configured Screenshot_TTL period, the cleanup process should delete 
     * both the file and the database reference.
     */
    it('Feature: vibgyorseek-employee-monitoring, Property 19: Screenshot TTL Deletion - should delete expired screenshots beyond TTL', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate test data with varying expiration scenarios
          fc.record({
            screenshots: fc.array(
              fc.record({
                id: fc.uuid(),
                employeeId: fc.uuid(),
                employeeName: fc.string({ minLength: 1, maxLength: 30 })
                  .filter(s => s.trim().length > 0)
                  .map(s => s.replace(/[/\\:*?"<>|]/g, '_')),
                // Generate dates that are expired (beyond TTL)
                daysOld: fc.integer({ min: 31, max: 365 }), // Beyond 30-day TTL
                fileSize: fc.integer({ min: 1000, max: 100000 }),
              }),
              { minLength: 1, maxLength: 10 }
            ),
          }),
          async (data) => {
            const now = new Date();
            const createdFiles: string[] = [];
            
            // Create test screenshot files and prepare database mock data
            const expiredScreenshots = data.screenshots.map(screenshot => {
              const createdAt = new Date(now);
              createdAt.setDate(createdAt.getDate() - screenshot.daysOld);
              
              const expiresAt = new Date(createdAt);
              expiresAt.setDate(expiresAt.getDate() + config.screenshotTtlDays);
              
              // Create directory structure
              const date = createdAt.toISOString().split('T')[0];
              const dir = path.join(testStoragePath, screenshot.employeeName, date);
              fs.mkdirSync(dir, { recursive: true });
              
              // Create test file
              const filePath = path.join(dir, `${screenshot.id}.jpg`);
              fs.writeFileSync(filePath, Buffer.alloc(screenshot.fileSize));
              createdFiles.push(filePath);
              
              return {
                id: screenshot.id,
                file_path: filePath,
                employee_id: screenshot.employeeId,
                created_at: createdAt,
                expires_at: expiresAt,
              };
            });

            // Mock database query to return expired screenshots
            let deleteCallCount = 0;
            mockQuery.mockImplementation((query: string) => {
              if (query.includes('SELECT') && query.includes('expires_at < CURRENT_TIMESTAMP')) {
                // Return expired screenshots
                return Promise.resolve({
                  rows: expiredScreenshots,
                });
              } else if (query.includes('DELETE FROM screenshots')) {
                // Track delete calls
                deleteCallCount++;
                return Promise.resolve({ rowCount: 1 });
              }
              return Promise.resolve({ rows: [], rowCount: 0 });
            });

            // Run cleanup
            const deletedCount = await cleanupService.runCleanup();

            // Verify all expired screenshots were deleted
            expect(deletedCount).toBe(expiredScreenshots.length);
            
            // Verify files were deleted from filesystem
            for (const filePath of createdFiles) {
              expect(fs.existsSync(filePath)).toBe(false);
            }
            
            // Verify database delete was called for each screenshot
            expect(deleteCallCount).toBe(expiredScreenshots.length);
          }
        ),
        { numRuns: 100 }
      );
    }, 120000); // 120 second timeout for file operations

    /**
     * Property: For any screenshot that has not exceeded TTL, it should NOT be deleted
     */
    it('Feature: vibgyorseek-employee-monitoring, Property 19: Screenshot TTL Deletion - should NOT delete screenshots within TTL', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            screenshots: fc.array(
              fc.record({
                id: fc.uuid(),
                employeeId: fc.uuid(),
                employeeName: fc.constant('TestEmployee'),
                // Generate dates that are NOT expired (within TTL)
                daysOld: fc.integer({ min: 0, max: 29 }), // Within 30-day TTL
                fileSize: fc.integer({ min: 1000, max: 50000 }),
              }),
              { minLength: 1, maxLength: 5 }
            ),
          }),
          async (data) => {
            const now = new Date();
            const createdFiles: string[] = [];
            
            // Create test screenshot files
            data.screenshots.forEach(screenshot => {
              const createdAt = new Date(now);
              createdAt.setDate(createdAt.getDate() - screenshot.daysOld);
              
              const expiresAt = new Date(createdAt);
              expiresAt.setDate(expiresAt.getDate() + config.screenshotTtlDays);
              
              // Create directory structure
              const date = createdAt.toISOString().split('T')[0];
              const dir = path.join(testStoragePath, screenshot.employeeName, date);
              fs.mkdirSync(dir, { recursive: true });
              
              // Create test file
              const filePath = path.join(dir, `${screenshot.id}.jpg`);
              fs.writeFileSync(filePath, Buffer.alloc(screenshot.fileSize));
              createdFiles.push(filePath);
            });

            // Mock database query to return NO expired screenshots
            mockQuery.mockImplementation((query: string) => {
              if (query.includes('SELECT') && query.includes('expires_at < CURRENT_TIMESTAMP')) {
                // Return empty array - no expired screenshots
                return Promise.resolve({ rows: [] });
              }
              return Promise.resolve({ rows: [], rowCount: 0 });
            });

            // Run cleanup
            const deletedCount = await cleanupService.runCleanup();

            // Verify no screenshots were deleted
            expect(deletedCount).toBe(0);
            
            // Verify files still exist on filesystem
            for (const filePath of createdFiles) {
              expect(fs.existsSync(filePath)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 120000);

    /**
     * Property: For any mix of expired and valid screenshots, only expired ones should be deleted
     */
    it('Feature: vibgyorseek-employee-monitoring, Property 19: Screenshot TTL Deletion - should delete only expired screenshots in mixed set', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            expiredCount: fc.integer({ min: 1, max: 5 }),
            validCount: fc.integer({ min: 1, max: 5 }),
            employeeName: fc.constant('MixedEmployee'),
          }),
          async (data) => {
            const now = new Date();
            const createdFiles: string[] = [];
            const expiredScreenshots: any[] = [];
            
            // Create expired screenshots
            for (let i = 0; i < data.expiredCount; i++) {
              const id = fc.sample(fc.uuid(), 1)[0];
              const daysOld = 31 + i; // Beyond TTL
              
              const createdAt = new Date(now);
              createdAt.setDate(createdAt.getDate() - daysOld);
              
              const expiresAt = new Date(createdAt);
              expiresAt.setDate(expiresAt.getDate() + config.screenshotTtlDays);
              
              const date = createdAt.toISOString().split('T')[0];
              const dir = path.join(testStoragePath, data.employeeName, date);
              fs.mkdirSync(dir, { recursive: true });
              
              const filePath = path.join(dir, `${id}.jpg`);
              fs.writeFileSync(filePath, Buffer.alloc(5000));
              createdFiles.push(filePath);
              
              expiredScreenshots.push({
                id,
                file_path: filePath,
                employee_id: fc.sample(fc.uuid(), 1)[0],
                created_at: createdAt,
                expires_at: expiresAt,
              });
            }
            
            // Create valid (non-expired) screenshots
            const validFiles: string[] = [];
            for (let i = 0; i < data.validCount; i++) {
              const id = fc.sample(fc.uuid(), 1)[0];
              const daysOld = i; // Within TTL
              
              const createdAt = new Date(now);
              createdAt.setDate(createdAt.getDate() - daysOld);
              
              const date = createdAt.toISOString().split('T')[0];
              const dir = path.join(testStoragePath, data.employeeName, date);
              fs.mkdirSync(dir, { recursive: true });
              
              const filePath = path.join(dir, `${id}.jpg`);
              fs.writeFileSync(filePath, Buffer.alloc(5000));
              validFiles.push(filePath);
            }

            // Mock database to return only expired screenshots
            let deleteCallCount = 0;
            mockQuery.mockImplementation((query: string) => {
              if (query.includes('SELECT') && query.includes('expires_at < CURRENT_TIMESTAMP')) {
                return Promise.resolve({ rows: expiredScreenshots });
              } else if (query.includes('DELETE FROM screenshots')) {
                deleteCallCount++;
                return Promise.resolve({ rowCount: 1 });
              }
              return Promise.resolve({ rows: [], rowCount: 0 });
            });

            // Run cleanup
            const deletedCount = await cleanupService.runCleanup();

            // Verify only expired screenshots were deleted
            expect(deletedCount).toBe(data.expiredCount);
            expect(deleteCallCount).toBe(data.expiredCount);
            
            // Verify expired files were deleted
            for (const filePath of createdFiles) {
              expect(fs.existsSync(filePath)).toBe(false);
            }
            
            // Verify valid files still exist
            for (const filePath of validFiles) {
              expect(fs.existsSync(filePath)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 120000);
  });

  describe('Property 20: Screenshot Deletion Logging', () => {
    /**
     * **Validates: Requirements 12.5**
     * 
     * Property: For any screenshot deleted by the cleanup process, a log entry should 
     * be created documenting the deletion with the screenshot ID and employee name.
     */
    it('Feature: vibgyorseek-employee-monitoring, Property 20: Screenshot Deletion Logging - should log deletion with screenshot ID and employee ID', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            screenshots: fc.array(
              fc.record({
                id: fc.uuid(),
                employeeId: fc.uuid(),
                employeeName: fc.string({ minLength: 1, maxLength: 30 })
                  .filter(s => s.trim().length > 0)
                  .map(s => s.replace(/[/\\:*?"<>|]/g, '_')),
                daysOld: fc.integer({ min: 31, max: 100 }),
              }),
              { minLength: 1, maxLength: 10 }
            ),
          }),
          async (data) => {
            const now = new Date();
            const createdFiles: string[] = [];
            
            // Create test screenshot files
            const expiredScreenshots = data.screenshots.map(screenshot => {
              const createdAt = new Date(now);
              createdAt.setDate(createdAt.getDate() - screenshot.daysOld);
              
              const expiresAt = new Date(createdAt);
              expiresAt.setDate(expiresAt.getDate() + config.screenshotTtlDays);
              
              const date = createdAt.toISOString().split('T')[0];
              const dir = path.join(testStoragePath, screenshot.employeeName, date);
              fs.mkdirSync(dir, { recursive: true });
              
              const filePath = path.join(dir, `${screenshot.id}.jpg`);
              fs.writeFileSync(filePath, Buffer.alloc(5000));
              createdFiles.push(filePath);
              
              return {
                id: screenshot.id,
                file_path: filePath,
                employee_id: screenshot.employeeId,
                created_at: createdAt,
                expires_at: expiresAt,
              };
            });

            // Mock database
            mockQuery.mockImplementation((query: string) => {
              if (query.includes('SELECT') && query.includes('expires_at < CURRENT_TIMESTAMP')) {
                return Promise.resolve({ rows: expiredScreenshots });
              } else if (query.includes('DELETE FROM screenshots')) {
                return Promise.resolve({ rowCount: 1 });
              }
              return Promise.resolve({ rows: [], rowCount: 0 });
            });

            // Clear logger mocks
            (logger.info as jest.Mock).mockClear();

            // Run cleanup
            await cleanupService.runCleanup();

            // Verify each deleted screenshot was logged with ID and employee ID
            for (const screenshot of expiredScreenshots) {
              expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining(`Deleted expired screenshot: ${screenshot.id}`),
              );
              expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining(`employee: ${screenshot.employee_id}`),
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 120000);

    /**
     * Property: For any screenshot deletion, the log should contain the screenshot ID
     */
    it('Feature: vibgyorseek-employee-monitoring, Property 20: Screenshot Deletion Logging - should log every deletion with screenshot ID', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            screenshotId: fc.uuid(),
            employeeId: fc.uuid(),
            employeeName: fc.constant('LogTestEmployee'),
            daysOld: fc.integer({ min: 31, max: 200 }),
          }),
          async (data) => {
            const now = new Date();
            const createdAt = new Date(now);
            createdAt.setDate(createdAt.getDate() - data.daysOld);
            
            const expiresAt = new Date(createdAt);
            expiresAt.setDate(expiresAt.getDate() + config.screenshotTtlDays);
            
            // Create test file
            const date = createdAt.toISOString().split('T')[0];
            const dir = path.join(testStoragePath, data.employeeName, date);
            fs.mkdirSync(dir, { recursive: true });
            
            const filePath = path.join(dir, `${data.screenshotId}.jpg`);
            fs.writeFileSync(filePath, Buffer.alloc(5000));
            
            const expiredScreenshot = {
              id: data.screenshotId,
              file_path: filePath,
              employee_id: data.employeeId,
              created_at: createdAt,
              expires_at: expiresAt,
            };

            // Mock database
            mockQuery.mockImplementation((query: string) => {
              if (query.includes('SELECT') && query.includes('expires_at < CURRENT_TIMESTAMP')) {
                return Promise.resolve({ rows: [expiredScreenshot] });
              } else if (query.includes('DELETE FROM screenshots')) {
                return Promise.resolve({ rowCount: 1 });
              }
              return Promise.resolve({ rows: [], rowCount: 0 });
            });

            // Clear logger mocks
            (logger.info as jest.Mock).mockClear();

            // Run cleanup
            await cleanupService.runCleanup();

            // Verify the specific screenshot ID was logged
            const logCalls = (logger.info as jest.Mock).mock.calls;
            const deletionLog = logCalls.find(call => 
              call[0].includes('Deleted expired screenshot') && 
              call[0].includes(data.screenshotId)
            );
            
            expect(deletionLog).toBeDefined();
            expect(deletionLog[0]).toContain(data.screenshotId);
            expect(deletionLog[0]).toContain(data.employeeId);
          }
        ),
        { numRuns: 100 }
      );
    }, 120000);

    /**
     * Property: For any batch of deletions, each deletion should have a separate log entry
     */
    it('Feature: vibgyorseek-employee-monitoring, Property 20: Screenshot Deletion Logging - should create separate log entry for each deletion', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            deleteCount: fc.integer({ min: 2, max: 8 }),
            employeeName: fc.constant('BatchEmployee'),
          }),
          async (data) => {
            const now = new Date();
            const expiredScreenshots: any[] = [];
            
            // Create multiple expired screenshots
            for (let i = 0; i < data.deleteCount; i++) {
              const id = fc.sample(fc.uuid(), 1)[0];
              const employeeId = fc.sample(fc.uuid(), 1)[0];
              const daysOld = 31 + i;
              
              const createdAt = new Date(now);
              createdAt.setDate(createdAt.getDate() - daysOld);
              
              const expiresAt = new Date(createdAt);
              expiresAt.setDate(expiresAt.getDate() + config.screenshotTtlDays);
              
              const date = createdAt.toISOString().split('T')[0];
              const dir = path.join(testStoragePath, data.employeeName, date);
              fs.mkdirSync(dir, { recursive: true });
              
              const filePath = path.join(dir, `${id}.jpg`);
              fs.writeFileSync(filePath, Buffer.alloc(5000));
              
              expiredScreenshots.push({
                id,
                file_path: filePath,
                employee_id: employeeId,
                created_at: createdAt,
                expires_at: expiresAt,
              });
            }

            // Mock database
            mockQuery.mockImplementation((query: string) => {
              if (query.includes('SELECT') && query.includes('expires_at < CURRENT_TIMESTAMP')) {
                return Promise.resolve({ rows: expiredScreenshots });
              } else if (query.includes('DELETE FROM screenshots')) {
                return Promise.resolve({ rowCount: 1 });
              }
              return Promise.resolve({ rows: [], rowCount: 0 });
            });

            // Clear logger mocks
            (logger.info as jest.Mock).mockClear();

            // Run cleanup
            await cleanupService.runCleanup();

            // Verify each screenshot has its own log entry
            const logCalls = (logger.info as jest.Mock).mock.calls;
            const deletionLogs = logCalls.filter(call => 
              call[0].includes('Deleted expired screenshot')
            );
            
            // Should have one log entry per deletion
            expect(deletionLogs.length).toBe(data.deleteCount);
            
            // Verify each screenshot ID appears in exactly one log entry
            for (const screenshot of expiredScreenshots) {
              const logsWithId = deletionLogs.filter(log => 
                log[0].includes(screenshot.id)
              );
              expect(logsWithId.length).toBe(1);
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 120000);
  });
});
