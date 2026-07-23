jest.mock('../../database/schemas', () => ({
  ServerConfigModel: {
    findOne: jest.fn(),
    create: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

import { config as runtimeConfig } from '../../config';
import { ServerConfigModel } from '../../database/schemas';
import { ServerConfig, ServerConfigService } from '../server-config.service';

const storedDocument = {
  key: 'global',
  port: 5100,
  nodeEnv: 'production',
  mongodbUri: 'mongodb://bootstrap/database',
  screenshotStoragePath: './db-screenshots',
  screenshotTtlDays: 45,
  clientAuthToken: 'db-client-token',
  jwtSecret: 'db-jwt-secret',
  logLevel: 'warn',
  shiftStartHour: 8,
  shiftEndHour: 19,
  fileUploadPath: './db-uploads',
  maxFileUploadSizeMb: 150,
  eodReportTime: '23:30',
};

describe('ServerConfigService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads the persisted database record and applies live runtime values', async () => {
    (ServerConfigModel.findOne as jest.Mock).mockResolvedValue(storedDocument);

    const service = new ServerConfigService();
    const result = await service.getCurrentConfig();

    expect(result.SCREENSHOT_TTL_DAYS).toBe('45');
    expect(runtimeConfig.screenshotTtlDays).toBe(45);
    expect(runtimeConfig.shiftStartHour).toBe(8);
    expect(runtimeConfig.clientAuthToken).toBe('db-client-token');
    expect(ServerConfigModel.create).not.toHaveBeenCalled();
  });

  it('upserts dashboard changes in MongoDB instead of writing an environment file', async () => {
    (ServerConfigModel.findOneAndUpdate as jest.Mock).mockResolvedValue(storedDocument);
    const service = new ServerConfigService();

    const input: ServerConfig = {
      PORT: '5100',
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://bootstrap/database',
      SCREENSHOT_STORAGE_PATH: './db-screenshots',
      SCREENSHOT_TTL_DAYS: '45',
      CLIENT_AUTH_TOKEN: 'db-client-token',
      JWT_SECRET: 'db-jwt-secret',
      LOG_LEVEL: 'warn',
      SHIFT_START_HOUR: '8',
      SHIFT_END_HOUR: '19',
      FILE_UPLOAD_PATH: './db-uploads',
      MAX_FILE_UPLOAD_SIZE_MB: '150',
      EOD_REPORT_TIME: '23:30',
    };

    await service.updateConfig(input);

    expect(ServerConfigModel.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'global' },
      expect.objectContaining({ $set: expect.objectContaining({ screenshotTtlDays: 45 }) }),
      expect.objectContaining({ new: true, upsert: true, runValidators: true })
    );
  });
});
