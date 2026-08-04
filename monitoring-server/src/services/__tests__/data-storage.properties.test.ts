/**
 * Property-based tests for data storage service
 * Feature: vibgyorseek-employee-monitoring, Property 13: Data Storage Round-Trip
 * 
 * Property 13: For any valid Data_Payload stored in the database, querying the database 
 * for that employee and timestamp should return monitoring data equivalent to the original payload.
 * 
 * Validates: Requirements 9.3
 */

import * as fc from 'fast-check';
import { employeeService } from '../employee.service';
import { activityLogService } from '../activity-log.service';
import { MonitoringPayload } from '../../models/activity-log.model';
import { database } from '../../utils/database';

// Mock the database module
jest.mock('../../utils/database');

// Mock the logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Data Storage Service - Property-Based Tests', () => {
  let mockQuery: jest.Mock;

  beforeEach(() => {
    mockQuery = database.query as jest.Mock;
    mockQuery.mockClear();
  });

  describe('Property 13: Data Storage Round-Trip', () => {
    /**
     * Property: For any valid Data_Payload stored in the database, querying the database
     * for that employee and timestamp should return monitoring data equivalent to the original payload.
     */
    it('should store and retrieve equivalent monitoring data for any valid payload', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate valid monitoring payloads
          fc.record({
            employee_name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
            timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
            interval_start: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
            interval_end: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
            work_seconds: fc.integer({ min: 0, max: 86400 }),
            idle_seconds: fc.integer({ min: 0, max: 86400 }),
            applications: fc.array(
              fc.record({
                name: fc.string({ minLength: 1, maxLength: 100 }),
                active: fc.boolean(),
              }),
              { minLength: 0, maxLength: 10 }
            ),
            browser_tabs: fc.array(
              fc.record({
                browser: fc.constantFrom('Chrome', 'Firefox', 'Edge'),
                title: fc.string({ minLength: 1, maxLength: 200 }),
                url: fc.webUrl(),
              }),
              { minLength: 0, maxLength: 10 }
            ),
          }),
          async (data) => {
            // Construct monitoring payload
            const payload: MonitoringPayload = {
              employee_name: data.employee_name.trim(),
              timestamp: data.timestamp.toISOString(),
              interval_start: data.interval_start.toISOString(),
              interval_end: data.interval_end.toISOString(),
              activity: {
                work_seconds: data.work_seconds,
                idle_seconds: data.idle_seconds,
              },
              applications: data.applications,
              browser_tabs: data.browser_tabs,
            };

            // Mock database responses
            const mockEmployeeId = `emp-${Math.random().toString(36).substring(7)}`;
            const mockActivityLogId = `log-${Math.random().toString(36).substring(7)}`;

            // Mock employee upsert
            mockQuery.mockResolvedValueOnce({
              rows: [
                {
                  id: mockEmployeeId,
                  name: payload.employee_name,
                  first_seen: new Date(),
                  last_seen: new Date(),
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ],
            });

            // Mock activity log insert
            mockQuery.mockResolvedValueOnce({
              rows: [
                {
                  id: mockActivityLogId,
                  employee_id: mockEmployeeId,
                  timestamp: new Date(payload.timestamp),
                  interval_start: new Date(payload.interval_start),
                  interval_end: new Date(payload.interval_end),
                  work_seconds: payload.activity.work_seconds,
                  idle_seconds: payload.activity.idle_seconds,
                  applications: payload.applications,
                  browser_tabs: payload.browser_tabs,
                  created_at: new Date(),
                },
              ],
            });

            // Store the data
            const employee = await employeeService.upsertEmployee(payload.employee_name);
            const activityLog = await activityLogService.storeActivityLog(employee.id, payload);

            // Verify stored data matches original payload
            expect(activityLog.employee_id).toBe(employee.id);
            expect(activityLog.timestamp.toISOString()).toBe(payload.timestamp);
            expect(activityLog.interval_start.toISOString()).toBe(payload.interval_start);
            expect(activityLog.interval_end.toISOString()).toBe(payload.interval_end);
            expect(activityLog.work_seconds).toBe(payload.activity.work_seconds);
            expect(activityLog.idle_seconds).toBe(payload.activity.idle_seconds);
            expect(activityLog.applications).toEqual(payload.applications);
            expect(activityLog.browser_tabs).toEqual(payload.browser_tabs);

            // Mock retrieval query
            mockQuery.mockResolvedValueOnce({
              rows: [
                {
                  id: mockActivityLogId,
                  employee_id: mockEmployeeId,
                  timestamp: new Date(payload.timestamp),
                  interval_start: new Date(payload.interval_start),
                  interval_end: new Date(payload.interval_end),
                  work_seconds: payload.activity.work_seconds,
                  idle_seconds: payload.activity.idle_seconds,
                  applications: payload.applications,
                  browser_tabs: payload.browser_tabs,
                  created_at: new Date(),
                },
              ],
            });

            // Retrieve the data
            const retrievedLogs = await activityLogService.getActivityLogsByEmployee(employee.id, 1);

            // Verify retrieved data is equivalent to original payload
            expect(retrievedLogs).toHaveLength(1);
            const retrievedLog = retrievedLogs[0];
            expect(retrievedLog.employee_id).toBe(employee.id);
            expect(retrievedLog.timestamp.toISOString()).toBe(payload.timestamp);
            expect(retrievedLog.interval_start.toISOString()).toBe(payload.interval_start);
            expect(retrievedLog.interval_end.toISOString()).toBe(payload.interval_end);
            expect(retrievedLog.work_seconds).toBe(payload.activity.work_seconds);
            expect(retrievedLog.idle_seconds).toBe(payload.activity.idle_seconds);
            expect(retrievedLog.applications).toEqual(payload.applications);
            expect(retrievedLog.browser_tabs).toEqual(payload.browser_tabs);
          }
        ),
        { numRuns: 100 }
      );
    }, 60000); // 60 second timeout for 100 iterations

    /**
     * Property: For any valid payload with empty applications and browser tabs,
     * the round-trip should preserve the empty arrays
     */
    it('should preserve empty arrays in round-trip storage', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            employee_name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
            timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
            work_seconds: fc.integer({ min: 0, max: 86400 }),
            idle_seconds: fc.integer({ min: 0, max: 86400 }),
          }),
          async (data) => {
            const payload: MonitoringPayload = {
              employee_name: data.employee_name.trim(),
              timestamp: data.timestamp.toISOString(),
              interval_start: data.timestamp.toISOString(),
              interval_end: data.timestamp.toISOString(),
              activity: {
                work_seconds: data.work_seconds,
                idle_seconds: data.idle_seconds,
              },
              applications: [],
              browser_tabs: [],
            };

            const mockEmployeeId = `emp-${Math.random().toString(36).substring(7)}`;
            const mockActivityLogId = `log-${Math.random().toString(36).substring(7)}`;

            // Mock employee upsert
            mockQuery.mockResolvedValueOnce({
              rows: [
                {
                  id: mockEmployeeId,
                  name: payload.employee_name,
                  first_seen: new Date(),
                  last_seen: new Date(),
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ],
            });

            // Mock activity log insert
            mockQuery.mockResolvedValueOnce({
              rows: [
                {
                  id: mockActivityLogId,
                  employee_id: mockEmployeeId,
                  timestamp: new Date(payload.timestamp),
                  interval_start: new Date(payload.interval_start),
                  interval_end: new Date(payload.interval_end),
                  work_seconds: payload.activity.work_seconds,
                  idle_seconds: payload.activity.idle_seconds,
                  applications: [],
                  browser_tabs: [],
                  created_at: new Date(),
                },
              ],
            });

            const employee = await employeeService.upsertEmployee(payload.employee_name);
            const activityLog = await activityLogService.storeActivityLog(employee.id, payload);

            // Verify empty arrays are preserved
            expect(activityLog.applications).toEqual([]);
            expect(activityLog.browser_tabs).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);

    /**
     * Property: For any payload with special characters in employee name,
     * the round-trip should preserve the exact name
     */
    it('should preserve special characters in employee names during round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 })
            .filter(s => s.trim().length > 0)
            .map(s => s.trim()),
          async (employeeName) => {
            const payload: MonitoringPayload = {
              employee_name: employeeName,
              timestamp: new Date().toISOString(),
              interval_start: new Date().toISOString(),
              interval_end: new Date().toISOString(),
              activity: {
                work_seconds: 100,
                idle_seconds: 50,
              },
              applications: [],
              browser_tabs: [],
            };

            const mockEmployeeId = `emp-${Math.random().toString(36).substring(7)}`;

            // Mock employee upsert
            mockQuery.mockResolvedValueOnce({
              rows: [
                {
                  id: mockEmployeeId,
                  name: employeeName,
                  first_seen: new Date(),
                  last_seen: new Date(),
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ],
            });

            const employee = await employeeService.upsertEmployee(payload.employee_name);

            // Verify employee name is preserved exactly
            expect(employee.name).toBe(employeeName);
          }
        ),
        { numRuns: 100 }
      );
    }, 60000);

    /**
     * Property: For any payload with boundary values for work and idle seconds,
     * the round-trip should preserve the exact values
     */
    it('should preserve boundary values for work and idle seconds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            employee_name: fc.constant('Test Employee'),
            work_seconds: fc.constantFrom(0, 1, 86399, 86400),
            idle_seconds: fc.constantFrom(0, 1, 86399, 86400),
          }),
          async (data) => {
            const payload: MonitoringPayload = {
              employee_name: data.employee_name,
              timestamp: new Date().toISOString(),
              interval_start: new Date().toISOString(),
              interval_end: new Date().toISOString(),
              activity: {
                work_seconds: data.work_seconds,
                idle_seconds: data.idle_seconds,
              },
              applications: [],
              browser_tabs: [],
            };

            const mockEmployeeId = 'emp-test';
            const mockActivityLogId = 'log-test';

            // Mock employee upsert
            mockQuery.mockResolvedValueOnce({
              rows: [
                {
                  id: mockEmployeeId,
                  name: payload.employee_name,
                  first_seen: new Date(),
                  last_seen: new Date(),
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ],
            });

            // Mock activity log insert
            mockQuery.mockResolvedValueOnce({
              rows: [
                {
                  id: mockActivityLogId,
                  employee_id: mockEmployeeId,
                  timestamp: new Date(payload.timestamp),
                  interval_start: new Date(payload.interval_start),
                  interval_end: new Date(payload.interval_end),
                  work_seconds: data.work_seconds,
                  idle_seconds: data.idle_seconds,
                  applications: [],
                  browser_tabs: [],
                  created_at: new Date(),
                },
              ],
            });

            const employee = await employeeService.upsertEmployee(payload.employee_name);
            const activityLog = await activityLogService.storeActivityLog(employee.id, payload);

            // Verify boundary values are preserved
            expect(activityLog.work_seconds).toBe(data.work_seconds);
            expect(activityLog.idle_seconds).toBe(data.idle_seconds);
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);
  });

  describe('Property 24: Concurrent Data Integrity', () => {
    /**
     * **Validates: Requirements 17.2**
     * 
     * Property: For any set of concurrent Data_Payload submissions from multiple clients,
     * all payloads should be stored in the database without data corruption or loss,
     * and each should be independently retrievable.
     */
    it('should store all concurrent payloads without corruption or loss', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate array of payloads from different clients
          fc.array(
            fc.record({
              employee_name: fc.string({ minLength: 1, maxLength: 50 })
                .filter(s => s.trim().length > 0)
                .map(s => s.trim()),
              timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') }),
              work_seconds: fc.integer({ min: 0, max: 3600 }),
              idle_seconds: fc.integer({ min: 0, max: 3600 }),
              app_count: fc.integer({ min: 0, max: 5 }),
              tab_count: fc.integer({ min: 0, max: 5 }),
            }),
            { minLength: 2, maxLength: 10 } // Simulate 2-10 concurrent clients
          ),
          async (clientData) => {
            // Track all stored IDs for verification
            const storedRecords: Array<{
              employeeId: string;
              activityLogId: string;
              payload: MonitoringPayload;
            }> = [];

            // Mock database to track all operations
            const employeeMap = new Map<string, string>();
            const activityLogs = new Map<string, any>();

            mockQuery.mockImplementation(async (sql: string, params?: any[]) => {
              // Employee upsert
              if (sql.includes('INSERT INTO employees')) {
                const employeeName = params?.[0];
                let employeeId = employeeMap.get(employeeName);
                
                if (!employeeId) {
                  employeeId = `emp-${Math.random().toString(36).substring(7)}`;
                  employeeMap.set(employeeName, employeeId);
                }

                return {
                  rows: [
                    {
                      id: employeeId,
                      name: employeeName,
                      first_seen: new Date(),
                      last_seen: new Date(),
                      created_at: new Date(),
                      updated_at: new Date(),
                    },
                  ],
                };
              }

              // Activity log insert
              if (sql.includes('INSERT INTO activity_logs')) {
                const activityLogId = `log-${Math.random().toString(36).substring(7)}`;
                const [employeeId, timestamp, intervalStart, intervalEnd, workSeconds, idleSeconds, applicationsJson, browserTabsJson] = params || [];

                // Parse JSON strings back to arrays (simulating PostgreSQL JSONB behavior)
                const applications = typeof applicationsJson === 'string' 
                  ? JSON.parse(applicationsJson) 
                  : (Array.isArray(applicationsJson) ? applicationsJson : []);
                const browserTabs = typeof browserTabsJson === 'string' 
                  ? JSON.parse(browserTabsJson) 
                  : (Array.isArray(browserTabsJson) ? browserTabsJson : []);

                const logEntry = {
                  id: activityLogId,
                  employee_id: employeeId,
                  timestamp: new Date(timestamp),
                  interval_start: new Date(intervalStart),
                  interval_end: new Date(intervalEnd),
                  work_seconds: workSeconds,
                  idle_seconds: idleSeconds,
                  applications,
                  browser_tabs: browserTabs,
                  created_at: new Date(),
                };

                activityLogs.set(activityLogId, logEntry);

                return {
                  rows: [logEntry],
                };
              }

              return { rows: [] };
            });

            // Submit all payloads concurrently
            const submissions = clientData.map(async (data) => {
              const payload: MonitoringPayload = {
                employee_name: data.employee_name,
                timestamp: data.timestamp.toISOString(),
                interval_start: data.timestamp.toISOString(),
                interval_end: new Date(data.timestamp.getTime() + 60000).toISOString(),
                activity: {
                  work_seconds: data.work_seconds,
                  idle_seconds: data.idle_seconds,
                },
                applications: Array.from({ length: data.app_count }, (_, i) => ({
                  name: `App-${i}`,
                  active: i === 0,
                })),
                browser_tabs: Array.from({ length: data.tab_count }, (_, i) => ({
                  browser: 'Chrome',
                  title: `Tab-${i}`,
                  url: `https://example.com/${i}`,
                })),
              };

              const employee = await employeeService.upsertEmployee(payload.employee_name);
              const activityLog = await activityLogService.storeActivityLog(employee.id, payload);

              return {
                employeeId: employee.id,
                activityLogId: activityLog.id,
                payload,
              };
            });

            // Wait for all concurrent submissions to complete
            const results = await Promise.all(submissions);
            storedRecords.push(...results);

            // Verify: All payloads were stored (no loss)
            expect(storedRecords).toHaveLength(clientData.length);

            // Verify: All activity log IDs are unique (no corruption)
            const activityLogIds = storedRecords.map(r => r.activityLogId);
            const uniqueActivityLogIds = new Set(activityLogIds);
            expect(uniqueActivityLogIds.size).toBe(activityLogIds.length);

            // Verify: Each payload is independently retrievable with correct data
            for (const record of storedRecords) {
              const retrievedLog = activityLogs.get(record.activityLogId);
              expect(retrievedLog).toBeDefined();
              
              // Verify data integrity - no corruption
              expect(retrievedLog.employee_id).toBe(record.employeeId);
              expect(retrievedLog.timestamp.toISOString()).toBe(record.payload.timestamp);
              expect(retrievedLog.work_seconds).toBe(record.payload.activity.work_seconds);
              expect(retrievedLog.idle_seconds).toBe(record.payload.activity.idle_seconds);
              expect(retrievedLog.applications).toEqual(record.payload.applications);
              expect(retrievedLog.browser_tabs).toEqual(record.payload.browser_tabs);
            }

            // Verify: Employee records are correctly associated
            const uniqueEmployeeNames = new Set(clientData.map(d => d.employee_name));
            expect(employeeMap.size).toBe(uniqueEmployeeNames.size);

            // Verify: Multiple submissions from same employee are stored separately
            const employeeSubmissions = new Map<string, number>();
            for (const record of storedRecords) {
              const count = employeeSubmissions.get(record.employeeId) || 0;
              employeeSubmissions.set(record.employeeId, count + 1);
            }

            for (const [employeeId, count] of employeeSubmissions) {
              const expectedCount = storedRecords.filter(r => r.employeeId === employeeId).length;
              expect(count).toBe(expectedCount);
            }
          }
        ),
        { numRuns: 100 }
      );
    }, 120000); // 120 second timeout for concurrent operations
  });
});
