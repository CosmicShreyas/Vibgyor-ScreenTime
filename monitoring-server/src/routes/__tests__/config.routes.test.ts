import request from 'supertest';
import express from 'express';
import configRoutes from '../config.routes';
import { configService } from '../../services/config.service';
import { websocketService } from '../../services/websocket.service';

jest.mock('../../services/config.service');
jest.mock('../../services/websocket.service');
jest.mock('../../utils/logger');
jest.mock('../../middleware/auth.middleware', () => ({
  validateJwtToken: (req: any, res: any, next: any) => next(),
}));

const app = express();
app.use(express.json());
app.use('/api/config', configRoutes);

describe('Config Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/config/client/:employeeName', () => {
    it('should return client configuration', async () => {
      const mockConfig = {
        employee_name: 'John Doe',
        server_url: 'http://localhost:5000/api/monitoring/data',
        auth_token: 'test-token',
        screenshot_interval_minutes: 10,
        data_send_interval_minutes: 10,
        location_update_interval_minutes: 30,
        idle_threshold_seconds: 300,
        app_usage_poll_interval_seconds: 10,
        screenshot_quality: 75,
        log_level: 'INFO',
        file_download_path: 'C:\\Downloads\\CompanyFiles',
        file_sync_interval: 30,
        version: 1,
        updated_at: new Date('2026-02-20T06:10:49.166Z'),
      };

      (configService.getClientConfig as jest.Mock).mockResolvedValue(mockConfig);

      const response = await request(app)
        .get('/api/config/client/John%20Doe')
        .expect(200);

      // Compare with serialized date
      expect(response.body).toEqual({
        ...mockConfig,
        updated_at: mockConfig.updated_at.toISOString()
      });
      expect(configService.getClientConfig).toHaveBeenCalledWith('John Doe');
    });

    it('should return 404 if configuration not found', async () => {
      (configService.getClientConfig as jest.Mock).mockResolvedValue(null);

      await request(app)
        .get('/api/config/client/Unknown')
        .expect(404);
    });

    it('should handle errors', async () => {
      (configService.getClientConfig as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await request(app)
        .get('/api/config/client/John%20Doe')
        .expect(500);
    });
  });

  describe('GET /api/config/client/:employeeName/version', () => {
    it('should return configuration version', async () => {
      (configService.getConfigVersion as jest.Mock).mockResolvedValue(5);

      const response = await request(app)
        .get('/api/config/client/John%20Doe/version')
        .expect(200);

      expect(response.body).toEqual({ version: 5 });
      expect(configService.getConfigVersion).toHaveBeenCalledWith('John Doe');
    });

    it('should handle errors', async () => {
      (configService.getConfigVersion as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await request(app)
        .get('/api/config/client/John%20Doe/version')
        .expect(500);
    });
  });

  describe('PUT /api/config/client/:employeeName', () => {
    it('should update client configuration', async () => {
      const configUpdate = {
        screenshot_interval_minutes: 15,
        screenshot_quality: 80,
      };

      (configService.updateClientConfig as jest.Mock).mockResolvedValue(undefined);
      (websocketService.notifyEmployeeUpdate as jest.Mock).mockReturnValue(undefined);

      const response = await request(app)
        .put('/api/config/client/John%20Doe')
        .send(configUpdate)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Configuration updated successfully',
      });
      expect(configService.updateClientConfig).toHaveBeenCalledWith(
        'John Doe',
        configUpdate
      );
      expect(websocketService.notifyEmployeeUpdate).toHaveBeenCalledWith(
        'John Doe',
        'config_update',
        { message: 'Configuration updated, please restart to apply changes' }
      );
    });

    it('should handle errors', async () => {
      (configService.updateClientConfig as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      await request(app)
        .put('/api/config/client/John%20Doe')
        .send({ screenshot_interval_minutes: 15 })
        .expect(500);
    });
  });

  describe('GET /api/config/defaults', () => {
    it('should return default configuration', async () => {
      const mockDefaults = {
        server_url: 'http://localhost:5000/api/monitoring/data',
        auth_token: 'default-token',
        screenshot_interval_minutes: 10,
        data_send_interval_minutes: 10,
        location_update_interval_minutes: 30,
        idle_threshold_seconds: 300,
        app_usage_poll_interval_seconds: 10,
        screenshot_quality: 75,
        log_level: 'INFO',
        file_download_path: 'C:\\Downloads\\CompanyFiles',
        file_sync_interval: 30,
      };

      (configService.getDefaultConfig as jest.Mock).mockReturnValue(mockDefaults);

      const response = await request(app)
        .get('/api/config/defaults')
        .expect(200);

      expect(response.body).toEqual(mockDefaults);
    });

    it('should handle errors', async () => {
      (configService.getDefaultConfig as jest.Mock).mockImplementation(() => {
        throw new Error('Error');
      });

      await request(app)
        .get('/api/config/defaults')
        .expect(500);
    });
  });
});
