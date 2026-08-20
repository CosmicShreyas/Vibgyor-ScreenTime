import * as fc from 'fast-check';
import request from 'supertest';
import express from 'express';
import dashboardRoutes from '../dashboard.routes';
import { employeeService } from '../../services/employee.service';
import { EmployeeSummary } from '../../models/employee.model';

// Mock the employee service
jest.mock('../../services/employee.service');

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Dashboard Routes - Property-Based Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/employees', dashboardRoutes);
    jest.clearAllMocks();
  });

  /**
   * Feature: vibgyorseek-employee-monitoring, Property 16: Employee Table Completeness
   * 
   * For any set of employees with monitoring data, the Dashboard_UI employee table 
   * should contain a row for each employee with all required fields: name, 
   * work_time_today, idle_time_today, last_update timestamp, and status.
   * 
   * **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
   */
  describe('Property 16: Employee Table Completeness', () => {
    it('should return all employees with complete required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 100 }),
              work_time_today: fc.nat({ max: 86400 }), // Max 24 hours in seconds
              idle_time_today: fc.nat({ max: 86400 }),
              last_update: fc.date(),
              status: fc.constantFrom('active' as const, 'idle' as const, 'offline' as const),
            }),
            { minLength: 0, maxLength: 60 } // Support up to 60 employees
          ),
          async (employees: EmployeeSummary[]) => {
            // Mock the service to return the generated employees
            (employeeService.getAllEmployeesWithSummary as jest.Mock).mockResolvedValue(employees);

            // Make the request
            const response = await request(app).get('/api/employees');

            // Verify response status
            expect(response.status).toBe(200);

            // Verify response is an array
            expect(Array.isArray(response.body)).toBe(true);

            // Verify the number of employees matches
            expect(response.body.length).toBe(employees.length);

            // Verify each employee has all required fields
            response.body.forEach((employee: EmployeeSummary, index: number) => {
              expect(employee).toHaveProperty('name');
              expect(employee).toHaveProperty('work_time_today');
              expect(employee).toHaveProperty('idle_time_today');
              expect(employee).toHaveProperty('last_update');
              expect(employee).toHaveProperty('status');

              // Verify field types
              expect(typeof employee.name).toBe('string');
              expect(typeof employee.work_time_today).toBe('number');
              expect(typeof employee.idle_time_today).toBe('number');
              expect(['active', 'idle', 'offline']).toContain(employee.status);

              // Verify values match the input
              expect(employee.name).toBe(employees[index].name);
              expect(employee.work_time_today).toBe(employees[index].work_time_today);
              expect(employee.idle_time_today).toBe(employees[index].idle_time_today);
              expect(employee.status).toBe(employees[index].status);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge cases: zero work time and idle time', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 100 }),
              work_time_today: fc.constant(0),
              idle_time_today: fc.constant(0),
              last_update: fc.date(),
              status: fc.constantFrom('active' as const, 'idle' as const, 'offline' as const),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (employees: EmployeeSummary[]) => {
            (employeeService.getAllEmployeesWithSummary as jest.Mock).mockResolvedValue(employees);

            const response = await request(app).get('/api/employees');

            expect(response.status).toBe(200);
            expect(response.body.length).toBe(employees.length);

            response.body.forEach((employee: EmployeeSummary) => {
              expect(employee.work_time_today).toBe(0);
              expect(employee.idle_time_today).toBe(0);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle maximum work time values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 100 }),
              work_time_today: fc.constant(86400), // 24 hours
              idle_time_today: fc.nat({ max: 86400 }),
              last_update: fc.date(),
              status: fc.constantFrom('active' as const, 'idle' as const, 'offline' as const),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (employees: EmployeeSummary[]) => {
            (employeeService.getAllEmployeesWithSummary as jest.Mock).mockResolvedValue(employees);

            const response = await request(app).get('/api/employees');

            expect(response.status).toBe(200);
            response.body.forEach((employee: EmployeeSummary) => {
              expect(employee.work_time_today).toBe(86400);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
