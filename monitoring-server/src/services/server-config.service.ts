import { config as runtimeConfig } from '../config';
import { ServerConfigModel } from '../database/schemas';
import { logger } from '../utils/logger';

export interface ServerConfig {
  PORT: string;
  NODE_ENV: string;
  MONGODB_URI: string;
  SCREENSHOT_STORAGE_PATH: string;
  SCREENSHOT_TTL_DAYS: string;
  CLIENT_AUTH_TOKEN: string;
  JWT_SECRET: string;
  LOG_LEVEL: string;
  SHIFT_START_HOUR: string;
  SHIFT_END_HOUR: string;
  FILE_UPLOAD_PATH: string;
  MAX_FILE_UPLOAD_SIZE_MB: string;
  EOD_REPORT_TIME: string;
}

const SINGLETON_KEY = 'global';

export class ServerConfigService {
  private validate(value: ServerConfig): void {
    const port = Number(value.PORT);
    const ttl = Number(value.SCREENSHOT_TTL_DAYS);
    const shiftStart = Number(value.SHIFT_START_HOUR);
    const shiftEnd = Number(value.SHIFT_END_HOUR);
    const maxUpload = Number(value.MAX_FILE_UPLOAD_SIZE_MB);

    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');
    if (!['development', 'production', 'test'].includes(value.NODE_ENV)) throw new Error('Invalid NODE_ENV');
    if (!['error', 'warn', 'info', 'debug'].includes(value.LOG_LEVEL)) throw new Error('Invalid LOG_LEVEL');
    if (!Number.isInteger(ttl) || ttl < 1) throw new Error('SCREENSHOT_TTL_DAYS must be at least 1');
    if (!Number.isInteger(shiftStart) || !Number.isInteger(shiftEnd) || shiftStart < 0 || shiftEnd > 23 || shiftEnd <= shiftStart) {
      throw new Error('Shift hours must be between 0 and 23, with the end after the start');
    }
    if (!Number.isFinite(maxUpload) || maxUpload < 1) throw new Error('MAX_FILE_UPLOAD_SIZE_MB must be at least 1');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.EOD_REPORT_TIME)) throw new Error('EOD_REPORT_TIME must use HH:MM format');
  }

  private bootstrapConfig(): ServerConfig {
    return {
      PORT: String(runtimeConfig.port),
      NODE_ENV: runtimeConfig.nodeEnv,
      MONGODB_URI: runtimeConfig.mongodbUri,
      SCREENSHOT_STORAGE_PATH: runtimeConfig.screenshotStoragePath,
      SCREENSHOT_TTL_DAYS: String(runtimeConfig.screenshotTtlDays),
      CLIENT_AUTH_TOKEN: runtimeConfig.clientAuthToken,
      JWT_SECRET: runtimeConfig.jwtSecret,
      LOG_LEVEL: runtimeConfig.logLevel,
      SHIFT_START_HOUR: String(runtimeConfig.shiftStartHour),
      SHIFT_END_HOUR: String(runtimeConfig.shiftEndHour),
      FILE_UPLOAD_PATH: runtimeConfig.fileUploadPath,
      MAX_FILE_UPLOAD_SIZE_MB: String(runtimeConfig.maxFileUploadSizeMb),
      EOD_REPORT_TIME: runtimeConfig.eodReportTime,
    };
  }

  private serialize(document: any): ServerConfig {
    return {
      PORT: String(document.port),
      NODE_ENV: document.nodeEnv,
      MONGODB_URI: document.mongodbUri,
      SCREENSHOT_STORAGE_PATH: document.screenshotStoragePath,
      SCREENSHOT_TTL_DAYS: String(document.screenshotTtlDays),
      CLIENT_AUTH_TOKEN: document.clientAuthToken,
      JWT_SECRET: document.jwtSecret,
      LOG_LEVEL: document.logLevel,
      SHIFT_START_HOUR: String(document.shiftStartHour),
      SHIFT_END_HOUR: String(document.shiftEndHour),
      FILE_UPLOAD_PATH: document.fileUploadPath,
      MAX_FILE_UPLOAD_SIZE_MB: String(document.maxFileUploadSizeMb),
      EOD_REPORT_TIME: document.eodReportTime,
    };
  }

  private toDocument(value: ServerConfig) {
    return {
      key: SINGLETON_KEY,
      port: Number(value.PORT),
      nodeEnv: value.NODE_ENV,
      mongodbUri: value.MONGODB_URI,
      screenshotStoragePath: value.SCREENSHOT_STORAGE_PATH,
      screenshotTtlDays: Number(value.SCREENSHOT_TTL_DAYS),
      clientAuthToken: value.CLIENT_AUTH_TOKEN,
      jwtSecret: value.JWT_SECRET,
      logLevel: value.LOG_LEVEL,
      shiftStartHour: Number(value.SHIFT_START_HOUR),
      shiftEndHour: Number(value.SHIFT_END_HOUR),
      fileUploadPath: value.FILE_UPLOAD_PATH,
      maxFileUploadSizeMb: Number(value.MAX_FILE_UPLOAD_SIZE_MB),
      eodReportTime: value.EOD_REPORT_TIME,
    };
  }

  private applyToRuntime(value: ServerConfig): void {
    runtimeConfig.port = Number(value.PORT);
    runtimeConfig.nodeEnv = value.NODE_ENV;
    runtimeConfig.screenshotStoragePath = value.SCREENSHOT_STORAGE_PATH;
    runtimeConfig.screenshotTtlDays = Number(value.SCREENSHOT_TTL_DAYS);
    runtimeConfig.clientAuthToken = value.CLIENT_AUTH_TOKEN;
    runtimeConfig.jwtSecret = value.JWT_SECRET;
    runtimeConfig.logLevel = value.LOG_LEVEL;
    runtimeConfig.shiftStartHour = Number(value.SHIFT_START_HOUR);
    runtimeConfig.shiftEndHour = Number(value.SHIFT_END_HOUR);
    runtimeConfig.fileUploadPath = value.FILE_UPLOAD_PATH;
    runtimeConfig.maxFileUploadSizeMb = Number(value.MAX_FILE_UPLOAD_SIZE_MB);
    runtimeConfig.eodReportTime = value.EOD_REPORT_TIME;
    logger.level = value.LOG_LEVEL;
  }

  async initialize(): Promise<ServerConfig> {
    const value = await this.getCurrentConfig();
    logger.info('Database-backed server configuration loaded');
    return value;
  }

  async getCurrentConfig(): Promise<ServerConfig> {
    let document = await ServerConfigModel.findOne({ key: SINGLETON_KEY });
    if (!document) {
      document = await ServerConfigModel.create(this.toDocument(this.bootstrapConfig()));
      logger.info('Created server configuration in MongoDB from bootstrap environment');
    }

    const value = this.serialize(document);
    this.applyToRuntime(value);
    return value;
  }

  async updateConfig(value: ServerConfig): Promise<ServerConfig> {
    this.validate(value);
    const document = this.toDocument(value);
    const saved = await ServerConfigModel.findOneAndUpdate(
      { key: SINGLETON_KEY },
      { $set: document },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    const updated = this.serialize(saved);
    this.applyToRuntime(updated);
    logger.info('Server configuration saved to MongoDB and applied to the running server');
    return updated;
  }
}

export const serverConfigService = new ServerConfigService();
