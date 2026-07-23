import { ScreenshotService } from '../screenshot.service';
import { database } from '../../utils/database';
import { config } from '../../config';
import fs from 'fs';
import path from 'path';

// Mock dependencies
jest.mock('../../utils/database');
jest.mock('../../utils/logger');

describe('ScreenshotService', () => {
  let service: ScreenshotService;
  const testStoragePath = path.join(__dirname, 'test-screenshots');

  beforeEach(() => {
    service = new ScreenshotService();
    jest.clearAllMocks();
    
    // Override config for testing
    (config as any).screenshotStoragePath = testStoragePath;
    (config as any).screenshotTtlDays = 30;
  });

  afterEach(async () => {
    // Clean up test files
    try {
      const testDir = testStoragePath;
      if (fs.existsSync(testDir)) {
        // Recursively remove test directory
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('storeScreenshot', () => {
    it('should store screenshot file and metadata in database', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';
      const activityLogId = '223e4567-e89b-12d3-a456-426614174000';
      const employeeName = 'John Doe';
      const capturedAt = new Date('2024-01-15T10:30:00Z');
      const screenshotData = Buffer.from('fake-image-data').toString('base64');

      const filePath = path.join(testStoragePath, employeeName, '2024-01-15', '2024-01-15T10-30-00-000Z.jpg');
      const mockScreenshot = {
        id: '323e4567-e89b-12d3-a456-426614174000',
        employee_id: employeeId,
        activity_log_id: activityLogId,
        file_path: filePath,
        file_size: Buffer.from(screenshotData, 'base64').length,
        captured_at: capturedAt,
        created_at: new Date(),
        expires_at: new Date('2024-02-14T10:30:00Z'),
      };

      (database.query as jest.Mock).mockResolvedValue({
        rows: [mockScreenshot],
      });

      const result = await service.storeScreenshot(
        employeeId,
        activityLogId,
        screenshotData,
        capturedAt,
        employeeName
      );

      // Verify database insert was called
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO screenshots'),
        expect.arrayContaining([employeeId, activityLogId])
      );

      // Verify result
      expect(result.id).toBe(mockScreenshot.id);
      expect(result.employee_id).toBe(employeeId);
      expect(result.activity_log_id).toBe(activityLogId);

      // Verify file was created
      expect(fs.existsSync(result.file_path)).toBe(true);
    });

    it('should create organized directory structure', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';
      const activityLogId = '223e4567-e89b-12d3-a456-426614174000';
      const employeeName = 'Jane Smith';
      const capturedAt = new Date('2024-01-15T10:30:00Z');
      const screenshotData = Buffer.from('fake-image-data').toString('base64');

      const mockScreenshot = {
        id: '323e4567-e89b-12d3-a456-426614174000',
        employee_id: employeeId,
        activity_log_id: activityLogId,
        file_path: path.join(testStoragePath, 'Jane Smith', '2024-01-15', '2024-01-15T10-30-00-000Z.jpg'),
        file_size: 15,
        captured_at: capturedAt,
        created_at: new Date(),
        expires_at: new Date('2024-02-14T10:30:00Z'),
      };

      (database.query as jest.Mock).mockResolvedValue({
        rows: [mockScreenshot],
      });

      const result = await service.storeScreenshot(
        employeeId,
        activityLogId,
        screenshotData,
        capturedAt,
        employeeName
      );

      // Verify directory structure: /screenshots/{employee_name}/{YYYY-MM-DD}/
      expect(result.file_path).toContain('Jane Smith');
      expect(result.file_path).toContain('2024-01-15');
      expect(result.file_path).toMatch(/\.jpg$/);
    });

    it('should calculate correct expiration date based on TTL', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';
      const activityLogId = '223e4567-e89b-12d3-a456-426614174000';
      const employeeName = 'John Doe';
      const capturedAt = new Date('2024-01-15T10:30:00Z');
      const screenshotData = Buffer.from('fake-image-data').toString('base64');

      let capturedExpiresAt: Date | null = null;

      (database.query as jest.Mock).mockImplementation((query: string, params: any[]) => {
        if (query.includes('INSERT INTO screenshots')) {
          capturedExpiresAt = params[5]; // expires_at is the 6th parameter
          return Promise.resolve({
            rows: [{
              id: '323e4567-e89b-12d3-a456-426614174000',
              employee_id: employeeId,
              activity_log_id: activityLogId,
              file_path: 'test.jpg',
              file_size: 15,
              captured_at: capturedAt,
              created_at: new Date(),
              expires_at: capturedExpiresAt,
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await service.storeScreenshot(
        employeeId,
        activityLogId,
        screenshotData,
        capturedAt,
        employeeName
      );

      // Verify expires_at is 30 days after captured_at
      expect(capturedExpiresAt).not.toBeNull();
      const expectedExpiration = new Date(capturedAt);
      expectedExpiration.setDate(expectedExpiration.getDate() + 30);
      expect(capturedExpiresAt!.getTime()).toBe(expectedExpiration.getTime());
    });

    it('should store correct file size in metadata', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';
      const activityLogId = '223e4567-e89b-12d3-a456-426614174000';
      const employeeName = 'John Doe';
      const capturedAt = new Date('2024-01-15T10:30:00Z');
      const testData = 'test-image-data-with-specific-length';
      const screenshotData = Buffer.from(testData).toString('base64');
      const expectedSize = Buffer.from(screenshotData, 'base64').length;

      let capturedFileSize: number | null = null;

      (database.query as jest.Mock).mockImplementation((query: string, params: any[]) => {
        if (query.includes('INSERT INTO screenshots')) {
          capturedFileSize = params[3]; // file_size is the 4th parameter
          return Promise.resolve({
            rows: [{
              id: '323e4567-e89b-12d3-a456-426614174000',
              employee_id: employeeId,
              activity_log_id: activityLogId,
              file_path: 'test.jpg',
              file_size: capturedFileSize,
              captured_at: capturedAt,
              created_at: new Date(),
              expires_at: new Date(),
            }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await service.storeScreenshot(
        employeeId,
        activityLogId,
        screenshotData,
        capturedAt,
        employeeName
      );

      expect(capturedFileSize).toBe(expectedSize);
    });
  });

  describe('getScreenshot', () => {
    it('should retrieve screenshot by ID', async () => {
      const screenshotId = '323e4567-e89b-12d3-a456-426614174000';
      const mockScreenshot = {
        id: screenshotId,
        employee_id: '123e4567-e89b-12d3-a456-426614174000',
        activity_log_id: '223e4567-e89b-12d3-a456-426614174000',
        file_path: '/screenshots/john/2024-01-15/screenshot.jpg',
        file_size: 1024,
        captured_at: new Date('2024-01-15T10:30:00Z'),
        created_at: new Date('2024-01-15T10:30:05Z'),
        expires_at: new Date('2024-02-14T10:30:00Z'),
      };

      (database.query as jest.Mock).mockResolvedValue({
        rows: [mockScreenshot],
      });

      const result = await service.getScreenshot(screenshotId);

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [screenshotId]
      );
      expect(result).toEqual(mockScreenshot);
    });

    it('should return null if screenshot not found', async () => {
      const screenshotId = '323e4567-e89b-12d3-a456-426614174000';

      (database.query as jest.Mock).mockResolvedValue({
        rows: [],
      });

      const result = await service.getScreenshot(screenshotId);

      expect(result).toBeNull();
    });
  });

  describe('getScreenshotsForEmployee', () => {
    it('should retrieve screenshots for employee with default limit', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';
      const mockScreenshots = [
        {
          id: '1',
          employee_id: employeeId,
          activity_log_id: 'log1',
          file_path: '/path1.jpg',
          file_size: 1024,
          captured_at: new Date('2024-01-15T10:30:00Z'),
          created_at: new Date(),
          expires_at: new Date(),
        },
        {
          id: '2',
          employee_id: employeeId,
          activity_log_id: 'log2',
          file_path: '/path2.jpg',
          file_size: 2048,
          captured_at: new Date('2024-01-15T11:30:00Z'),
          created_at: new Date(),
          expires_at: new Date(),
        },
      ];

      (database.query as jest.Mock).mockResolvedValue({
        rows: mockScreenshots,
      });

      const result = await service.getScreenshotsForEmployee(employeeId);

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY captured_at DESC'),
        [employeeId, 50] // Default limit is 50
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1');
    });

    it('should respect custom limit parameter', async () => {
      const employeeId = '123e4567-e89b-12d3-a456-426614174000';

      (database.query as jest.Mock).mockResolvedValue({
        rows: [],
      });

      await service.getScreenshotsForEmployee(employeeId, 10);

      expect(database.query).toHaveBeenCalledWith(
        expect.any(String),
        [employeeId, 10]
      );
    });
  });

  describe('deleteExpiredScreenshots', () => {
    it('should delete expired screenshots and return count', async () => {
      const expiredScreenshots = [
        {
          id: '1',
          file_path: path.join(testStoragePath, 'test1.jpg'),
          employee_id: 'emp1',
        },
        {
          id: '2',
          file_path: path.join(testStoragePath, 'test2.jpg'),
          employee_id: 'emp2',
        },
      ];

      // Create test files
      fs.mkdirSync(testStoragePath, { recursive: true });
      fs.writeFileSync(expiredScreenshots[0].file_path, 'test1');
      fs.writeFileSync(expiredScreenshots[1].file_path, 'test2');

      (database.query as jest.Mock)
        .mockResolvedValueOnce({ rows: expiredScreenshots }) // SELECT expired
        .mockResolvedValue({ rows: [] }); // DELETE queries

      const result = await service.deleteExpiredScreenshots();

      expect(result).toBe(2);
      // Verify SELECT query was called (without second parameter)
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE expires_at < CURRENT_TIMESTAMP')
      );
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM screenshots'),
        ['1']
      );
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM screenshots'),
        ['2']
      );

      // Verify files were deleted
      expect(fs.existsSync(expiredScreenshots[0].file_path)).toBe(false);
      expect(fs.existsSync(expiredScreenshots[1].file_path)).toBe(false);
    });

    it('should continue deletion even if one file fails', async () => {
      const expiredScreenshots = [
        {
          id: '1',
          file_path: '/nonexistent/test1.jpg', // This will fail
          employee_id: 'emp1',
        },
        {
          id: '2',
          file_path: path.join(testStoragePath, 'test2.jpg'),
          employee_id: 'emp2',
        },
      ];

      // Create only the second test file
      fs.mkdirSync(testStoragePath, { recursive: true });
      fs.writeFileSync(expiredScreenshots[1].file_path, 'test2');

      (database.query as jest.Mock)
        .mockResolvedValueOnce({ rows: expiredScreenshots })
        .mockResolvedValue({ rows: [] });

      const result = await service.deleteExpiredScreenshots();

      // Should still delete the second file
      expect(result).toBe(1);
      expect(fs.existsSync(expiredScreenshots[1].file_path)).toBe(false);
    });

    it('should return 0 if no expired screenshots', async () => {
      (database.query as jest.Mock).mockResolvedValue({
        rows: [],
      });

      const result = await service.deleteExpiredScreenshots();

      expect(result).toBe(0);
    });
  });
});
