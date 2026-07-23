/**
 * Property-based tests for monitoring data reception endpoint
 * Feature: vibgyorseek-employee-monitoring
 * Testing Library: fast-check
 */

import * as fc from 'fast-check';
import request from 'supertest';
import express from 'express';
import monitoringRoutes from '../monitoring.routes';
import { config } from '../../config';
import { validateMonitoringPayload } from '../../models/validation.schemas';

// Create test app
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/api/monitoring', monitoringRoutes);

// Generators for valid data types
const validEmployeeNameArb = fc.string({ minLength: 1, maxLength: 255 }).filter(s => s.trim().length > 0);
const validTimestampArb = fc.date().map(d => d.toISOString());
const nonNegativeNumberArb = fc.nat({ max: 86400 }); // Max 24 hours in seconds

const validApplicationArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  active: fc.boolean()
});

const validBrowserTabArb = fc.record({
  browser: fc.constantFrom('Chrome', 'Firefox', 'Edge'),
  title: fc.string({ minLength: 1, maxLength: 200 }),
  url: fc.webUrl()
});

const validMonitoringPayloadArb = fc.record({
  employee_name: validEmployeeNameArb,
  timestamp: validTimestampArb,
  interval_start: validTimestampArb,
  interval_end: validTimestampArb,
  activity: fc.record({
    work_seconds: nonNegativeNumberArb,
    idle_seconds: nonNegativeNumberArb
  }),
  applications: fc.array(validApplicationArb, { maxLength: 20 }),
  browser_tabs: fc.array(validBrowserTabArb, { maxLength: 50 }),
  screenshot: fc.option(fc.string({ minLength: 10, maxLength: 1000 }), { nil: undefined })
});

describe('Property-Based Tests: Monitoring Data Reception', () => {
  /**
   * Property 12: Payload Validation
   * For any Data_Payload received by the Dashboard_Server, the validation function
   * should return true if all required fields are present and properly typed,
   * and false otherwise.
   * 
   * **Validates: Requirements 9.2**
   */
  describe('Property 12: Payload Validation', () => {
    it('should validate all valid payloads as true', () => {
      fc.assert(
        fc.property(validMonitoringPayloadArb, (payload) => {
          const result = validateMonitoringPayload(payload);
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject payloads missing employee_name', () => {
      fc.assert(
        fc.property(validMonitoringPayloadArb, (payload) => {
          const invalidPayload = { ...payload };
          delete (invalidPayload as any).employee_name;
          
          const result = validateMonitoringPayload(invalidPayload);
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.includes('employee_name'))).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject payloads with empty employee_name', () => {
      fc.assert(
        fc.property(validMonitoringPayloadArb, (payload) => {
          const invalidPayload = { ...payload, employee_name: '' };
          
          const result = validateMonitoringPayload(invalidPayload);
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject payloads missing timestamp', () => {
      fc.assert(
        fc.property(validMonitoringPayloadArb, (payload) => {
          const invalidPayload = { ...payload };
          delete (invalidPayload as any).timestamp;
          
          const result = validateMonitoringPayload(invalidPayload);
          expect(result.valid).toBe(false);
          expect(result.errors.some(e => e.includes('timestamp'))).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject payloads missing activity object', () => {
      fc.assert(
        fc.property(validMonitoringPayloadArb, (payload) => {
          const invalidPayload = { ...payload };
          delete (invalidPayload as any).activity;
          
          const result = validateMonitoringPayload(invalidPayload);
          expect(result.valid).toBe(false);
          expect(result.errors.some(e => e.includes('activity'))).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject payloads with negative work_seconds', () => {
      fc.assert(
        fc.property(
          validMonitoringPayloadArb,
          fc.integer({ min: -1000, max: -1 }),
          (payload, negativeValue) => {
            const invalidPayload = {
              ...payload,
              activity: { ...payload.activity, work_seconds: negativeValue }
            };
            
            const result = validateMonitoringPayload(invalidPayload);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('work_seconds'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject payloads with negative idle_seconds', () => {
      fc.assert(
        fc.property(
          validMonitoringPayloadArb,
          fc.integer({ min: -1000, max: -1 }),
          (payload, negativeValue) => {
            const invalidPayload = {
              ...payload,
              activity: { ...payload.activity, idle_seconds: negativeValue }
            };
            
            const result = validateMonitoringPayload(invalidPayload);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('idle_seconds'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject payloads missing applications array', () => {
      fc.assert(
        fc.property(validMonitoringPayloadArb, (payload) => {
          const invalidPayload = { ...payload };
          delete (invalidPayload as any).applications;
          
          const result = validateMonitoringPayload(invalidPayload);
          expect(result.valid).toBe(false);
          expect(result.errors.some(e => e.includes('applications'))).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject payloads missing browser_tabs array', () => {
      fc.assert(
        fc.property(validMonitoringPayloadArb, (payload) => {
          const invalidPayload = { ...payload };
          delete (invalidPayload as any).browser_tabs;
          
          const result = validateMonitoringPayload(invalidPayload);
          expect(result.valid).toBe(false);
          expect(result.errors.some(e => e.includes('browser_tabs'))).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should accept payloads with empty applications array', () => {
      fc.assert(
        fc.property(validMonitoringPayloadArb, (payload) => {
          const validPayload = { ...payload, applications: [] };
          
          const result = validateMonitoringPayload(validPayload);
          expect(result.valid).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should accept payloads with empty browser_tabs array', () => {
      fc.assert(
        fc.property(validMonitoringPayloadArb, (payload) => {
          const validPayload = { ...payload, browser_tabs: [] };
          
          const result = validateMonitoringPayload(validPayload);
          expect(result.valid).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should accept payloads without screenshot field', () => {
      fc.assert(
        fc.property(validMonitoringPayloadArb, (payload) => {
          const validPayload = { ...payload };
          delete (validPayload as any).screenshot;
          
          const result = validateMonitoringPayload(validPayload);
          expect(result.valid).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 15: Invalid Payload Rejection
   * For any invalid Data_Payload received by the Dashboard_Server, the server
   * should return an HTTP error response (4xx status code) and create a log
   * entry documenting the rejection.
   * 
   * **Validates: Requirements 9.5**
   */
  describe('Property 15: Invalid Payload Rejection', () => {
    it('should return 400 status for any invalid payload', async () => {
      await fc.assert(
        fc.asyncProperty(validMonitoringPayloadArb, async (payload) => {
          // Create an invalid payload by removing employee_name
          const invalidPayload = { ...payload };
          delete (invalidPayload as any).employee_name;
          
          const response = await request(app)
            .post('/api/monitoring/data')
            .set('Authorization', `Bearer ${config.clientAuthToken}`)
            .send(invalidPayload);
          
          expect(response.status).toBe(400);
          expect(response.body).toHaveProperty('error');
          expect(response.body).toHaveProperty('details');
        }),
        { numRuns: 100 }
      );
    });

    it('should return error details for invalid payloads', async () => {
      await fc.assert(
        fc.asyncProperty(validMonitoringPayloadArb, async (payload) => {
          // Create an invalid payload by removing timestamp
          const invalidPayload = { ...payload };
          delete (invalidPayload as any).timestamp;
          
          const response = await request(app)
            .post('/api/monitoring/data')
            .set('Authorization', `Bearer ${config.clientAuthToken}`)
            .send(invalidPayload);
          
          expect(response.status).toBe(400);
          expect(response.body.details).toBeDefined();
          expect(Array.isArray(response.body.details)).toBe(true);
          expect(response.body.details.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('should return 200 status for all valid payloads', async () => {
      await fc.assert(
        fc.asyncProperty(validMonitoringPayloadArb, async (payload) => {
          const response = await request(app)
            .post('/api/monitoring/data')
            .set('Authorization', `Bearer ${config.clientAuthToken}`)
            .send(payload);
          
          expect(response.status).toBe(200);
          expect(response.body).toHaveProperty('success', true);
        }),
        { numRuns: 100 }
      );
    });

    it('should reject payloads with invalid activity structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          validMonitoringPayloadArb,
          fc.integer({ min: -1000, max: -1 }),
          async (payload, negativeValue) => {
            const invalidPayload = {
              ...payload,
              activity: { work_seconds: negativeValue, idle_seconds: 100 }
            };
            
            const response = await request(app)
              .post('/api/monitoring/data')
              .set('Authorization', `Bearer ${config.clientAuthToken}`)
              .send(invalidPayload);
            
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject payloads with invalid application objects', async () => {
      await fc.assert(
        fc.asyncProperty(validMonitoringPayloadArb, async (payload) => {
          const invalidPayload = {
            ...payload,
            applications: [{ name: 'App', active: 'not-a-boolean' }]
          };
          
          const response = await request(app)
            .post('/api/monitoring/data')
            .set('Authorization', `Bearer ${config.clientAuthToken}`)
            .send(invalidPayload);
          
          expect(response.status).toBe(400);
          expect(response.body).toHaveProperty('error');
        }),
        { numRuns: 100 }
      );
    });
  });
});
