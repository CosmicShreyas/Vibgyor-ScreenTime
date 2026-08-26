import request from 'supertest';
import express from 'express';
import monitoringRoutes from '../monitoring.routes';
import { config } from '../../config';
import { websocketService } from '../../services/websocket.service';

// Mock the websocket service
jest.mock('../../services/websocket.service', () => ({
  websocketService: {
    notifyEmployeeUpdate: jest.fn()
  }
}));

// Create test app
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/api/monitoring', monitoringRoutes);

describe('POST /api/monitoring/data', () => {
  const validPayload = {
    employee_name: 'John Doe',
    timestamp: '2024-01-15T14:30:00Z',
    interval_start: '2024-01-15T14:20:00Z',
    interval_end: '2024-01-15T14:30:00Z',
    activity: {
      work_seconds: 480,
      idle_seconds: 120
    },
    applications: [
      { name: 'Visual Studio Code', active: true },
      { name: 'Google Chrome', active: false }
    ],
    browser_tabs: [
      { browser: 'Chrome', title: 'GitHub', url: 'https://github.com' }
    ],
    screenshot: 'base64_encoded_data'
  };

  describe('Authentication', () => {
    it('should reject request without authorization header', async () => {
      const response = await request(app)
        .post('/api/monitoring/data')
        .send(validPayload);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', 'Bearer invalid_token')
        .send(validPayload);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should accept request with valid token', async () => {
      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(validPayload);

      expect(response.status).not.toBe(401);
    });
  });

  describe('Payload Validation', () => {
    it('should accept valid payload', async () => {
      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(validPayload);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should reject payload without employee_name', async () => {
      const invalidPayload = { ...validPayload };
      delete (invalidPayload as any).employee_name;

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('details');
    });

    it('should reject payload with empty employee_name', async () => {
      const invalidPayload = { ...validPayload, employee_name: '' };

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject payload without timestamp', async () => {
      const invalidPayload = { ...validPayload };
      delete (invalidPayload as any).timestamp;

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject payload with invalid timestamp', async () => {
      const invalidPayload = { ...validPayload, timestamp: 'not-a-date' };

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject payload without activity object', async () => {
      const invalidPayload = { ...validPayload };
      delete (invalidPayload as any).activity;

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject payload with negative work_seconds', async () => {
      const invalidPayload = {
        ...validPayload,
        activity: { work_seconds: -10, idle_seconds: 120 }
      };

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject payload without applications array', async () => {
      const invalidPayload = { ...validPayload };
      delete (invalidPayload as any).applications;

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject payload with invalid application object', async () => {
      const invalidPayload = {
        ...validPayload,
        applications: [{ name: 'App', active: 'not-boolean' }]
      };

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject payload without browser_tabs array', async () => {
      const invalidPayload = { ...validPayload };
      delete (invalidPayload as any).browser_tabs;

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should accept payload with empty arrays', async () => {
      const payloadWithEmptyArrays = {
        ...validPayload,
        applications: [],
        browser_tabs: []
      };

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(payloadWithEmptyArrays);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should accept payload without screenshot', async () => {
      const payloadWithoutScreenshot = { ...validPayload };
      delete (payloadWithoutScreenshot as any).screenshot;

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(payloadWithoutScreenshot);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });
  });

  describe('WebSocket Notifications', () => {
    beforeEach(() => {
      // Clear mock calls before each test
      jest.clearAllMocks();
    });

    it('should send notification when valid data is received', async () => {
      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(validPayload);

      expect(response.status).toBe(200);
      
      // Verify notification was sent
      expect(websocketService.notifyEmployeeUpdate).toHaveBeenCalledTimes(1);
      expect(websocketService.notifyEmployeeUpdate).toHaveBeenCalledWith(
        'John Doe',
        'data_update',
        expect.objectContaining({
          timestamp: validPayload.timestamp,
          work_seconds: 480,
          idle_seconds: 120,
          applications_count: 2,
          browser_tabs_count: 1
        })
      );
    });

    it('should not send notification when payload is invalid', async () => {
      const invalidPayload = { ...validPayload };
      delete (invalidPayload as any).employee_name;

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(invalidPayload);

      expect(response.status).toBe(400);
      
      // Verify notification was NOT sent
      expect(websocketService.notifyEmployeeUpdate).not.toHaveBeenCalled();
    });

    it('should still succeed even if notification fails', async () => {
      // Mock notification to throw error
      (websocketService.notifyEmployeeUpdate as jest.Mock).mockImplementationOnce(() => {
        throw new Error('WebSocket error');
      });

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(validPayload);

      // Request should still succeed
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    it('should include correct counts in notification payload', async () => {
      const payloadWithMultipleItems = {
        ...validPayload,
        applications: [
          { name: 'App1', active: true },
          { name: 'App2', active: false },
          { name: 'App3', active: false }
        ],
        browser_tabs: [
          { browser: 'Chrome', title: 'Tab1', url: 'https://example1.com' },
          { browser: 'Chrome', title: 'Tab2', url: 'https://example2.com' },
          { browser: 'Firefox', title: 'Tab3', url: 'https://example3.com' }
        ]
      };

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(payloadWithMultipleItems);

      expect(response.status).toBe(200);
      
      expect(websocketService.notifyEmployeeUpdate).toHaveBeenCalledWith(
        'John Doe',
        'data_update',
        expect.objectContaining({
          applications_count: 3,
          browser_tabs_count: 3
        })
      );
    });

    it('should handle empty arrays in notification payload', async () => {
      const payloadWithEmptyArrays = {
        ...validPayload,
        applications: [],
        browser_tabs: []
      };

      const response = await request(app)
        .post('/api/monitoring/data')
        .set('Authorization', `Bearer ${config.clientAuthToken}`)
        .send(payloadWithEmptyArrays);

      expect(response.status).toBe(200);
      
      expect(websocketService.notifyEmployeeUpdate).toHaveBeenCalledWith(
        'John Doe',
        'data_update',
        expect.objectContaining({
          applications_count: 0,
          browser_tabs_count: 0
        })
      );
    });
  });
});
