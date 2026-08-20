import request from 'supertest';
import express from 'express';
import dashboardRoutes from '../dashboard.routes';
import { employeeService } from '../../services/employee.service';
import { EmployeeSummary, EmployeeDetail } from '../../models/employee.model';

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

describe('Dashboard Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/employees', dashboardRoutes);
    jest.clearAllMocks();
  });

  describe('GET /api/employees', () => {
    it('should return list of employees with summary data', async () => {
      const mockEmployees: EmployeeSummary[] = [
        {
          name: 'John Doe',
          work_time_today: 14400,
          idle_time_today: 3600,
          last_update: new Date('2024-01-15T14:30:00Z'),
          status: 'active',
        },
        {
          name: 'Jane Smith',
          work_time_today: 10800,
          idle_time_today: 7200,
          last_update: new Date('2024-01-15T14:25:00Z'),
          status: 'active',
        },
      ];

      (employeeService.getAllEmployeesWithSummary as jest.Mock).mockResolvedValue(mockEmployees);

      const response = await request(app).get('/api/employees');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].name).toBe('John Doe');
      expect(response.body[0].work_time_today).toBe(14400);
      expect(response.body[0].idle_time_today).toBe(3600);
      expect(response.body[0].status).toBe('active');
      expect(response.body[1].name).toBe('Jane Smith');
      expect(employeeService.getAllEmployeesWithSummary).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no employees exist', async () => {
      (employeeService.getAllEmployeesWithSummary as jest.Mock).mockResolvedValue([]);

      const response = await request(app).get('/api/employees');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
      expect(employeeService.getAllEmployeesWithSummary).toHaveBeenCalledTimes(1);
    });

    it('should return 500 when service throws error', async () => {
      (employeeService.getAllEmployeesWithSummary as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app).get('/api/employees');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch employees' });
    });

    it('should include all required fields in employee summary', async () => {
      const mockEmployees: EmployeeSummary[] = [
        {
          name: 'Test Employee',
          work_time_today: 7200,
          idle_time_today: 1800,
          last_update: new Date('2024-01-15T12:00:00Z'),
          status: 'idle',
        },
      ];

      (employeeService.getAllEmployeesWithSummary as jest.Mock).mockResolvedValue(mockEmployees);

      const response = await request(app).get('/api/employees');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      
      const employee = response.body[0];
      expect(employee).toHaveProperty('name');
      expect(employee).toHaveProperty('work_time_today');
      expect(employee).toHaveProperty('idle_time_today');
      expect(employee).toHaveProperty('last_update');
      expect(employee).toHaveProperty('status');
    });

    it('should handle different employee statuses', async () => {
      const mockEmployees: EmployeeSummary[] = [
        {
          name: 'Active Employee',
          work_time_today: 3600,
          idle_time_today: 0,
          last_update: new Date(),
          status: 'active',
        },
        {
          name: 'Idle Employee',
          work_time_today: 7200,
          idle_time_today: 1800,
          last_update: new Date(Date.now() - 30 * 60000), // 30 minutes ago
          status: 'idle',
        },
        {
          name: 'Offline Employee',
          work_time_today: 14400,
          idle_time_today: 3600,
          last_update: new Date(Date.now() - 120 * 60000), // 2 hours ago
          status: 'offline',
        },
      ];

      (employeeService.getAllEmployeesWithSummary as jest.Mock).mockResolvedValue(mockEmployees);

      const response = await request(app).get('/api/employees');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(3);
      expect(response.body[0].status).toBe('active');
      expect(response.body[1].status).toBe('idle');
      expect(response.body[2].status).toBe('offline');
    });
  });

  describe('GET /api/employees/:name', () => {
    it('should return employee detail for existing employee', async () => {
      const mockEmployeeDetail: EmployeeDetail = {
        name: 'John Doe',
        current_applications: [
          { name: 'Visual Studio Code', active: true },
          { name: 'Google Chrome', active: false },
        ],
        current_browser_tabs: [
          { browser: 'Chrome', title: 'GitHub', url: 'https://github.com' },
          { browser: 'Chrome', title: 'Stack Overflow', url: 'https://stackoverflow.com' },
        ],
        activity_history: [
          {
            timestamp: new Date('2024-01-15T10:00:00Z'),
            work_seconds: 600,
            idle_seconds: 0,
          },
          {
            timestamp: new Date('2024-01-15T10:10:00Z'),
            work_seconds: 540,
            idle_seconds: 60,
          },
        ],
        recent_screenshots: [
          {
            id: 'screenshot-1',
            thumbnail_url: '/api/screenshots/screenshot-1',
            full_url: '/api/screenshots/screenshot-1',
            captured_at: new Date('2024-01-15T10:00:00Z'),
          },
        ],
      };

      (employeeService.getEmployeeDetail as jest.Mock).mockResolvedValue(mockEmployeeDetail);

      const response = await request(app).get('/api/employees/John%20Doe');

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('John Doe');
      expect(response.body.current_applications).toHaveLength(2);
      expect(response.body.current_browser_tabs).toHaveLength(2);
      expect(response.body.activity_history).toHaveLength(2);
      expect(response.body.recent_screenshots).toHaveLength(1);
      expect(employeeService.getEmployeeDetail).toHaveBeenCalledWith('John Doe');
    });

    it('should return 404 when employee not found', async () => {
      (employeeService.getEmployeeDetail as jest.Mock).mockResolvedValue(null);

      const response = await request(app).get('/api/employees/NonExistent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Employee not found' });
      expect(employeeService.getEmployeeDetail).toHaveBeenCalledWith('NonExistent');
    });

    it('should return 500 when service throws error', async () => {
      (employeeService.getEmployeeDetail as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app).get('/api/employees/John%20Doe');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch employee detail' });
    });

    it('should include all required fields in employee detail', async () => {
      const mockEmployeeDetail: EmployeeDetail = {
        name: 'Test Employee',
        current_applications: [{ name: 'Slack', active: true }],
        current_browser_tabs: [{ browser: 'Firefox', title: 'Test', url: 'https://test.com' }],
        activity_history: [
          {
            timestamp: new Date('2024-01-15T12:00:00Z'),
            work_seconds: 300,
            idle_seconds: 300,
          },
        ],
        recent_screenshots: [],
      };

      (employeeService.getEmployeeDetail as jest.Mock).mockResolvedValue(mockEmployeeDetail);

      const response = await request(app).get('/api/employees/Test%20Employee');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('current_applications');
      expect(response.body).toHaveProperty('current_browser_tabs');
      expect(response.body).toHaveProperty('activity_history');
      expect(response.body).toHaveProperty('recent_screenshots');
    });

    it('should handle employee with no activity data', async () => {
      const mockEmployeeDetail: EmployeeDetail = {
        name: 'New Employee',
        current_applications: [],
        current_browser_tabs: [],
        activity_history: [],
        recent_screenshots: [],
      };

      (employeeService.getEmployeeDetail as jest.Mock).mockResolvedValue(mockEmployeeDetail);

      const response = await request(app).get('/api/employees/New%20Employee');

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('New Employee');
      expect(response.body.current_applications).toEqual([]);
      expect(response.body.current_browser_tabs).toEqual([]);
      expect(response.body.activity_history).toEqual([]);
      expect(response.body.recent_screenshots).toEqual([]);
    });

    it('should handle URL-encoded employee names', async () => {
      const mockEmployeeDetail: EmployeeDetail = {
        name: 'John O\'Brien',
        current_applications: [],
        current_browser_tabs: [],
        activity_history: [],
        recent_screenshots: [],
      };

      (employeeService.getEmployeeDetail as jest.Mock).mockResolvedValue(mockEmployeeDetail);

      const response = await request(app).get('/api/employees/John%20O%27Brien');

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('John O\'Brien');
      expect(employeeService.getEmployeeDetail).toHaveBeenCalledWith('John O\'Brien');
    });

    it('should include active application indicator', async () => {
      const mockEmployeeDetail: EmployeeDetail = {
        name: 'Test User',
        current_applications: [
          { name: 'VS Code', active: true },
          { name: 'Chrome', active: false },
          { name: 'Slack', active: false },
        ],
        current_browser_tabs: [],
        activity_history: [],
        recent_screenshots: [],
      };

      (employeeService.getEmployeeDetail as jest.Mock).mockResolvedValue(mockEmployeeDetail);

      const response = await request(app).get('/api/employees/Test%20User');

      expect(response.status).toBe(200);
      expect(response.body.current_applications[0].active).toBe(true);
      expect(response.body.current_applications[1].active).toBe(false);
      expect(response.body.current_applications[2].active).toBe(false);
    });

    it('should include browser tab details', async () => {
      const mockEmployeeDetail: EmployeeDetail = {
        name: 'Test User',
        current_applications: [],
        current_browser_tabs: [
          { browser: 'Chrome', title: 'GitHub - Project', url: 'https://github.com/project' },
          { browser: 'Firefox', title: 'Documentation', url: 'https://docs.example.com' },
        ],
        activity_history: [],
        recent_screenshots: [],
      };

      (employeeService.getEmployeeDetail as jest.Mock).mockResolvedValue(mockEmployeeDetail);

      const response = await request(app).get('/api/employees/Test%20User');

      expect(response.status).toBe(200);
      expect(response.body.current_browser_tabs).toHaveLength(2);
      expect(response.body.current_browser_tabs[0]).toHaveProperty('browser');
      expect(response.body.current_browser_tabs[0]).toHaveProperty('title');
      expect(response.body.current_browser_tabs[0]).toHaveProperty('url');
    });

    it('should include activity history with timestamps', async () => {
      const mockEmployeeDetail: EmployeeDetail = {
        name: 'Test User',
        current_applications: [],
        current_browser_tabs: [],
        activity_history: [
          {
            timestamp: new Date('2024-01-15T09:00:00Z'),
            work_seconds: 500,
            idle_seconds: 100,
          },
          {
            timestamp: new Date('2024-01-15T09:10:00Z'),
            work_seconds: 450,
            idle_seconds: 150,
          },
        ],
        recent_screenshots: [],
      };

      (employeeService.getEmployeeDetail as jest.Mock).mockResolvedValue(mockEmployeeDetail);

      const response = await request(app).get('/api/employees/Test%20User');

      expect(response.status).toBe(200);
      expect(response.body.activity_history).toHaveLength(2);
      expect(response.body.activity_history[0]).toHaveProperty('timestamp');
      expect(response.body.activity_history[0]).toHaveProperty('work_seconds');
      expect(response.body.activity_history[0]).toHaveProperty('idle_seconds');
    });

    it('should include screenshot URLs', async () => {
      const mockEmployeeDetail: EmployeeDetail = {
        name: 'Test User',
        current_applications: [],
        current_browser_tabs: [],
        activity_history: [],
        recent_screenshots: [
          {
            id: 'screenshot-1',
            thumbnail_url: '/api/screenshots/screenshot-1',
            full_url: '/api/screenshots/screenshot-1',
            captured_at: new Date('2024-01-15T10:00:00Z'),
          },
          {
            id: 'screenshot-2',
            thumbnail_url: '/api/screenshots/screenshot-2',
            full_url: '/api/screenshots/screenshot-2',
            captured_at: new Date('2024-01-15T10:10:00Z'),
          },
        ],
      };

      (employeeService.getEmployeeDetail as jest.Mock).mockResolvedValue(mockEmployeeDetail);

      const response = await request(app).get('/api/employees/Test%20User');

      expect(response.status).toBe(200);
      expect(response.body.recent_screenshots).toHaveLength(2);
      expect(response.body.recent_screenshots[0]).toHaveProperty('id');
      expect(response.body.recent_screenshots[0]).toHaveProperty('thumbnail_url');
      expect(response.body.recent_screenshots[0]).toHaveProperty('full_url');
      expect(response.body.recent_screenshots[0]).toHaveProperty('captured_at');
    });
  });
});
