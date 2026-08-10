import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { config } from '../../config';

// Mock fs/promises module before importing anything else
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  stat: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
  mkdir: jest.fn(),
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the screenshot service
jest.mock('../../services/screenshot.service');

import screenshotRoutes from '../screenshot.routes';
import { screenshotService } from '../../services/screenshot.service';
import { Screenshot } from '../../models/screenshot.model';
import * as fsPromises from 'fs/promises';

describe('Screenshot Routes', () => {
  let app: express.Application;
  let validToken: string;
  let tempDir: string;
  let tempFile: string;
  const mockFileContent = Buffer.from('fake-jpeg-image-data');
  const mockScreenshot: Screenshot = {
    id: 'screenshot-123',
    employee_id: 'employee-456',
    activity_log_id: 'activity-789',
    file_path: '/screenshots/john-doe/2024-01-15/2024-01-15T10-00-00-000Z.jpg',
    file_size: 102400,
    captured_at: new Date('2024-01-15T10:00:00Z'),
    created_at: new Date('2024-01-15T10:00:05Z'),
    expires_at: new Date('2024-02-14T10:00:00Z'),
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/screenshots', screenshotRoutes);
    jest.clearAllMocks();

    // Create a real on-disk file so res.sendFile can stream it end-to-end:
    // Express's sendFile uses the callback-based fs module (not the mocked
    // fs/promises), so a real file is required for the happy path.
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-routes-'));
    tempFile = path.join(tempDir, '2024-01-15T10-00-00-000Z.jpg');
    fs.writeFileSync(tempFile, mockFileContent);
    mockScreenshot.file_path = tempFile;

    // Generate valid JWT token for testing
    validToken = jwt.sign({ userId: 'test-user' }, config.jwtSecret, { expiresIn: '1h' });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('GET /api/screenshots/:id', () => {
    it('should serve screenshot image file for valid ID with authentication', async () => {
      (screenshotService.getScreenshot as jest.Mock).mockResolvedValue(mockScreenshot);
      (fsPromises.stat as jest.Mock).mockResolvedValue({ size: mockFileContent.length });

      const response = await request(app)
        .get('/api/screenshots/screenshot-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.headers['content-length']).toBe(String(mockFileContent.length));
      expect(response.headers['cache-control']).toBe('public, max-age=86400');
      expect(response.body).toEqual(mockFileContent);
      expect(screenshotService.getScreenshot).toHaveBeenCalledWith('screenshot-123');
    });

    it('should return 401 when no authentication token provided', async () => {
      const response = await request(app).get('/api/screenshots/screenshot-123');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Missing authentication token' });
      expect(screenshotService.getScreenshot).not.toHaveBeenCalled();
    });

    it('should return 401 when invalid authentication token provided', async () => {
      const response = await request(app)
        .get('/api/screenshots/screenshot-123')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid authentication token' });
      expect(screenshotService.getScreenshot).not.toHaveBeenCalled();
    });

    it('should return 404 when screenshot not found in database', async () => {
      (screenshotService.getScreenshot as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/screenshots/nonexistent-id')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Screenshot not found' });
      expect(screenshotService.getScreenshot).toHaveBeenCalledWith('nonexistent-id');
    });

    it('should return 404 when screenshot file not found on disk', async () => {
      (screenshotService.getScreenshot as jest.Mock).mockResolvedValue(mockScreenshot);
      (fsPromises.stat as jest.Mock).mockRejectedValue(new Error('ENOENT: no such file'));

      const response = await request(app)
        .get('/api/screenshots/screenshot-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Screenshot file not found' });
      expect(screenshotService.getScreenshot).toHaveBeenCalledWith('screenshot-123');
    });

    it('should return 500 when service throws error', async () => {
      (screenshotService.getScreenshot as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .get('/api/screenshots/screenshot-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch screenshot' });
    });

    it('should return 404 when the file disappears between the existence check and streaming', async () => {
      // The existence check (mocked stat) passes, but Express's real sendFile
      // hits ENOENT, which surfaces as a NotFoundError -> 404.
      (screenshotService.getScreenshot as jest.Mock).mockResolvedValue({ ...mockScreenshot, file_path: path.join(tempDir, 'missing.jpg') });
      (fsPromises.stat as jest.Mock).mockResolvedValue({ size: 1024 });

      const response = await request(app)
        .get('/api/screenshots/screenshot-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      // The route sets Content-Type: image/jpeg before streaming, so the JSON
      // error body arrives as a raw buffer rather than a parsed JSON body.
      expect(JSON.parse(response.body.toString())).toEqual({ error: 'Screenshot file not found' });
    });

    it('should serve screenshots whose stored file_path is relative (legacy records)', async () => {
      // Pre-fix, records were persisted with paths like 'screenshots/...' relative
      // to the server working directory; res.sendFile rejected those with a 500
      // ("path must be absolute or specify root to res.sendFile").
      const relativePath = path.relative(process.cwd(), tempFile);
      (screenshotService.getScreenshot as jest.Mock).mockResolvedValue({ ...mockScreenshot, file_path: relativePath });
      (fsPromises.stat as jest.Mock).mockResolvedValue({ size: mockFileContent.length });

      const response = await request(app)
        .get('/api/screenshots/screenshot-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockFileContent);
    });

    it('should handle different screenshot IDs', async () => {
      const screenshots = [
        { ...mockScreenshot, id: 'screenshot-1' },
        { ...mockScreenshot, id: 'screenshot-2' },
        { ...mockScreenshot, id: 'screenshot-3' },
      ];

      for (const screenshot of screenshots) {
        (screenshotService.getScreenshot as jest.Mock).mockResolvedValue(screenshot);
        (fsPromises.stat as jest.Mock).mockResolvedValue({ size: mockFileContent.length });

        const response = await request(app)
          .get(`/api/screenshots/${screenshot.id}`)
          .set('Authorization', `Bearer ${validToken}`);

        expect(response.status).toBe(200);
        expect(screenshotService.getScreenshot).toHaveBeenCalledWith(screenshot.id);
      }
    });

    it('should set correct content type for JPEG images', async () => {
      (screenshotService.getScreenshot as jest.Mock).mockResolvedValue(mockScreenshot);
      (fsPromises.stat as jest.Mock).mockResolvedValue({ size: mockFileContent.length });

      const response = await request(app)
        .get('/api/screenshots/screenshot-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
    });

    it('should set cache control headers', async () => {
      (screenshotService.getScreenshot as jest.Mock).mockResolvedValue(mockScreenshot);
      (fsPromises.stat as jest.Mock).mockResolvedValue({ size: mockFileContent.length });

      const response = await request(app)
        .get('/api/screenshots/screenshot-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('public, max-age=86400');
    });

    it('should handle large screenshot files', async () => {
      const largeFileBuffer = Buffer.alloc(5 * 1024 * 1024); // 5MB
      fs.writeFileSync(tempFile, largeFileBuffer);

      (screenshotService.getScreenshot as jest.Mock).mockResolvedValue(mockScreenshot);
      (fsPromises.stat as jest.Mock).mockResolvedValue({ size: largeFileBuffer.length });

      const response = await request(app)
        .get('/api/screenshots/screenshot-123')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-length']).toBe(String(largeFileBuffer.length));
    });

    it('should accept Bearer token with different casing', async () => {
      (screenshotService.getScreenshot as jest.Mock).mockResolvedValue(mockScreenshot);
      (fsPromises.stat as jest.Mock).mockResolvedValue({ size: mockFileContent.length });

      const response = await request(app)
        .get('/api/screenshots/screenshot-123')
        .set('Authorization', `bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(screenshotService.getScreenshot).toHaveBeenCalledWith('screenshot-123');
    });
  });
});
