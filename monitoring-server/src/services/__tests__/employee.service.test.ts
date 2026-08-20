import { EmployeeService } from '../employee.service';
import { database } from '../../utils/database';

// Mock the database module
jest.mock('../../utils/database');
jest.mock('../../utils/logger');

describe('EmployeeService', () => {
  let employeeService: EmployeeService;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    employeeService = new EmployeeService();
    mockQuery = database.query as jest.Mock;
    mockQuery.mockClear();
  });

  describe('upsertEmployee', () => {
    it('should create a new employee if not exists', async () => {
      const mockEmployee = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'John Doe',
        first_seen: new Date('2024-01-15T10:00:00Z'),
        last_seen: new Date('2024-01-15T10:00:00Z'),
        created_at: new Date('2024-01-15T10:00:00Z'),
        updated_at: new Date('2024-01-15T10:00:00Z'),
      };

      mockQuery.mockResolvedValue({
        rows: [mockEmployee],
      });

      const result = await employeeService.upsertEmployee('John Doe');

      expect(result).toEqual(mockEmployee);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO employees'),
        ['John Doe']
      );
    });

    it('should update last_seen if employee exists', async () => {
      const mockEmployee = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Jane Smith',
        first_seen: new Date('2024-01-10T10:00:00Z'),
        last_seen: new Date('2024-01-15T10:00:00Z'),
        created_at: new Date('2024-01-10T10:00:00Z'),
        updated_at: new Date('2024-01-15T10:00:00Z'),
      };

      mockQuery.mockResolvedValue({
        rows: [mockEmployee],
      });

      const result = await employeeService.upsertEmployee('Jane Smith');

      expect(result).toEqual(mockEmployee);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (name)'),
        ['Jane Smith']
      );
    });

    it('should trim whitespace from employee name', async () => {
      const mockEmployee = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Bob Johnson',
        first_seen: new Date('2024-01-15T10:00:00Z'),
        last_seen: new Date('2024-01-15T10:00:00Z'),
        created_at: new Date('2024-01-15T10:00:00Z'),
        updated_at: new Date('2024-01-15T10:00:00Z'),
      };

      mockQuery.mockResolvedValue({
        rows: [mockEmployee],
      });

      await employeeService.upsertEmployee('  Bob Johnson  ');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['Bob Johnson']
      );
    });

    it('should throw error for invalid employee name', async () => {
      await expect(employeeService.upsertEmployee('')).rejects.toThrow('Invalid employee name');
      await expect(employeeService.upsertEmployee('   ')).rejects.toThrow('Invalid employee name');
    });

    it('should throw error if database operation fails', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(employeeService.upsertEmployee('John Doe')).rejects.toThrow('Database error');
    });
  });

  describe('getEmployeeByName', () => {
    it('should return employee if found', async () => {
      const mockEmployee = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'John Doe',
        first_seen: new Date('2024-01-15T10:00:00Z'),
        last_seen: new Date('2024-01-15T10:00:00Z'),
        created_at: new Date('2024-01-15T10:00:00Z'),
        updated_at: new Date('2024-01-15T10:00:00Z'),
      };

      mockQuery.mockResolvedValue({
        rows: [mockEmployee],
      });

      const result = await employeeService.getEmployeeByName('John Doe');

      expect(result).toEqual(mockEmployee);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE name = $1'),
        ['John Doe']
      );
    });

    it('should return null if employee not found', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
      });

      const result = await employeeService.getEmployeeByName('Nonexistent User');

      expect(result).toBeNull();
    });

    it('should throw error for invalid employee name', async () => {
      await expect(employeeService.getEmployeeByName('')).rejects.toThrow('Invalid employee name');
    });
  });

  describe('getAllEmployees', () => {
    it('should return all employees', async () => {
      const mockEmployees = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Alice',
          first_seen: new Date('2024-01-15T10:00:00Z'),
          last_seen: new Date('2024-01-15T10:00:00Z'),
          created_at: new Date('2024-01-15T10:00:00Z'),
          updated_at: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: '223e4567-e89b-12d3-a456-426614174001',
          name: 'Bob',
          first_seen: new Date('2024-01-15T11:00:00Z'),
          last_seen: new Date('2024-01-15T11:00:00Z'),
          created_at: new Date('2024-01-15T11:00:00Z'),
          updated_at: new Date('2024-01-15T11:00:00Z'),
        },
      ];

      mockQuery.mockResolvedValue({
        rows: mockEmployees,
      });

      const result = await employeeService.getAllEmployees();

      expect(result).toEqual(mockEmployees);
      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY name ASC')
      );
    });

    it('should return empty array if no employees', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
      });

      const result = await employeeService.getAllEmployees();

      expect(result).toEqual([]);
    });
  });

  describe('getAllEmployeesWithSummary', () => {
    it('should return employees with summary data', async () => {
      const mockRows = [
        {
          name: 'Alice',
          last_update: new Date(Date.now() - 5 * 60000), // 5 minutes ago
          work_time_today: '3600',
          idle_time_today: '600',
        },
        {
          name: 'Bob',
          last_update: new Date(Date.now() - 30 * 60000), // 30 minutes ago
          work_time_today: '7200',
          idle_time_today: '1200',
        },
      ];

      mockQuery.mockResolvedValue({
        rows: mockRows,
      });

      const result = await employeeService.getAllEmployeesWithSummary();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        name: 'Alice',
        work_time_today: 3600,
        idle_time_today: 600,
        status: 'active', // Less than 15 minutes
      });
      expect(result[1]).toMatchObject({
        name: 'Bob',
        work_time_today: 7200,
        idle_time_today: 1200,
        status: 'idle', // Between 15 and 60 minutes
      });
    });

    it('should mark employee as offline if last update > 60 minutes', async () => {
      const mockRows = [
        {
          name: 'Charlie',
          last_update: new Date(Date.now() - 90 * 60000), // 90 minutes ago
          work_time_today: '1800',
          idle_time_today: '300',
        },
      ];

      mockQuery.mockResolvedValue({
        rows: mockRows,
      });

      const result = await employeeService.getAllEmployeesWithSummary();

      expect(result[0].status).toBe('offline');
    });

    it('should handle employees with no activity logs', async () => {
      const mockRows = [
        {
          name: 'NewEmployee',
          last_update: new Date(),
          work_time_today: '0',
          idle_time_today: '0',
        },
      ];

      mockQuery.mockResolvedValue({
        rows: mockRows,
      });

      const result = await employeeService.getAllEmployeesWithSummary();

      expect(result[0]).toMatchObject({
        name: 'NewEmployee',
        work_time_today: 0,
        idle_time_today: 0,
      });
    });
  });

  describe('updateLastSeen', () => {
    it('should update last_seen timestamp', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await employeeService.updateLastSeen('123e4567-e89b-12d3-a456-426614174000');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE employees'),
        ['123e4567-e89b-12d3-a456-426614174000']
      );
    });

    it('should throw error if database operation fails', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(
        employeeService.updateLastSeen('123e4567-e89b-12d3-a456-426614174000')
      ).rejects.toThrow('Database error');
    });
  });

  describe('getEmployeeDetail', () => {
    const mockEmployeeId = '123e4567-e89b-12d3-a456-426614174000';

    it('should return employee detail with all data', async () => {
      // Mock getEmployeeByName
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: mockEmployeeId,
              name: 'John Doe',
              first_seen: new Date('2024-01-10T10:00:00Z'),
              last_seen: new Date('2024-01-15T10:00:00Z'),
              created_at: new Date('2024-01-10T10:00:00Z'),
              updated_at: new Date('2024-01-15T10:00:00Z'),
            },
          ],
        })
        // Mock latest activity log
        .mockResolvedValueOnce({
          rows: [
            {
              applications: [
                { name: 'VS Code', active: true },
                { name: 'Chrome', active: false },
              ],
              browser_tabs: [
                { browser: 'Chrome', title: 'GitHub', url: 'https://github.com' },
              ],
            },
          ],
        })
        // Mock activity history
        .mockResolvedValueOnce({
          rows: [
            {
              timestamp: new Date('2024-01-15T09:00:00Z'),
              work_seconds: 500,
              idle_seconds: 100,
            },
            {
              timestamp: new Date('2024-01-15T10:00:00Z'),
              work_seconds: 450,
              idle_seconds: 150,
            },
          ],
        })
        // Mock screenshots
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'screenshot-1',
              captured_at: new Date('2024-01-15T09:30:00Z'),
            },
          ],
        });

      const result = await employeeService.getEmployeeDetail('John Doe');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('John Doe');
      expect(result?.current_applications).toHaveLength(2);
      expect(result?.current_browser_tabs).toHaveLength(1);
      expect(result?.activity_history).toHaveLength(2);
      expect(result?.recent_screenshots).toHaveLength(1);
    });

    it('should return null if employee not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const result = await employeeService.getEmployeeDetail('NonExistent');

      expect(result).toBeNull();
    });

    it('should handle employee with no activity logs', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: mockEmployeeId,
              name: 'New Employee',
              first_seen: new Date(),
              last_seen: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // No latest activity
        .mockResolvedValueOnce({ rows: [] }) // No activity history
        .mockResolvedValueOnce({ rows: [] }); // No screenshots

      const result = await employeeService.getEmployeeDetail('New Employee');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('New Employee');
      expect(result?.current_applications).toEqual([]);
      expect(result?.current_browser_tabs).toEqual([]);
      expect(result?.activity_history).toEqual([]);
      expect(result?.recent_screenshots).toEqual([]);
    });

    it('should include screenshot URLs in correct format', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: mockEmployeeId,
              name: 'Test User',
              first_seen: new Date(),
              last_seen: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'screenshot-123',
              captured_at: new Date('2024-01-15T10:00:00Z'),
            },
          ],
        });

      const result = await employeeService.getEmployeeDetail('Test User');

      expect(result?.recent_screenshots[0]).toMatchObject({
        id: 'screenshot-123',
        thumbnail_url: '/api/screenshots/screenshot-123',
        full_url: '/api/screenshots/screenshot-123',
      });
    });

    it('should throw error for invalid employee name', async () => {
      await expect(employeeService.getEmployeeDetail('')).rejects.toThrow('Invalid employee name');
      await expect(employeeService.getEmployeeDetail('   ')).rejects.toThrow('Invalid employee name');
    });

    it('should trim whitespace from employee name', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: mockEmployeeId,
              name: 'Test User',
              first_seen: new Date(),
              last_seen: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await employeeService.getEmployeeDetail('  Test User  ');

      expect(result?.name).toBe('Test User');
    });

    it('should query activity history for today only', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: mockEmployeeId,
              name: 'Test User',
              first_seen: new Date(),
              last_seen: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await employeeService.getEmployeeDetail('Test User');

      // Check that the activity history query was called with date range
      const activityHistoryCall = mockQuery.mock.calls[2];
      expect(activityHistoryCall[0]).toContain('timestamp >= $2');
      expect(activityHistoryCall[0]).toContain('timestamp <= $3');
    });

    it('should limit screenshots to 20 most recent', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            {
              id: mockEmployeeId,
              name: 'Test User',
              first_seen: new Date(),
              last_seen: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await employeeService.getEmployeeDetail('Test User');

      // Check that the screenshots query limits to 20
      const screenshotsCall = mockQuery.mock.calls[3];
      expect(screenshotsCall[0]).toContain('LIMIT 20');
    });
  });
});
