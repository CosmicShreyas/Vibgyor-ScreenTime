import dotenv from 'dotenv';

dotenv.config();

interface Config {
  port: number;
  nodeEnv: string;
  mongodbUri: string;
  screenshotStoragePath: string;
  screenshotTtlDays: number;
  clientAuthToken: string;
  jwtSecret: string;
  logLevel: string;
  logMaxSizeMb: number;
  logMaxFiles: number;
  shiftStartHour: number;
  shiftEndHour: number;
  fileUploadPath: string;
  maxFileUploadSizeMb: number;
}

const getEnvVar = (key: string, defaultValue?: string): string => {
  const value = process.env[key];
  if (!value && !defaultValue) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue!;
};

const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid number for environment variable ${key}: ${value}`);
  }
  return parsed;
};

export const config: Config = {
  port: getEnvNumber('PORT', 3000),
  nodeEnv: getEnvVar('NODE_ENV', 'development'),
  mongodbUri: getEnvVar('MONGODB_URI'),
  screenshotStoragePath: getEnvVar('SCREENSHOT_STORAGE_PATH', './screenshots'),
  screenshotTtlDays: getEnvNumber('SCREENSHOT_TTL_DAYS', 30),
  clientAuthToken: getEnvVar('CLIENT_AUTH_TOKEN'),
  jwtSecret: getEnvVar('JWT_SECRET'),
  logLevel: getEnvVar('LOG_LEVEL', 'info'),
  logMaxSizeMb: getEnvNumber('LOG_MAX_SIZE_MB', 10),
  logMaxFiles: getEnvNumber('LOG_MAX_FILES', 5),
  shiftStartHour: getEnvNumber('SHIFT_START_HOUR', 9),
  shiftEndHour: getEnvNumber('SHIFT_END_HOUR', 20),
  fileUploadPath: getEnvVar('FILE_UPLOAD_PATH', './uploads'),
  maxFileUploadSizeMb: getEnvNumber('MAX_FILE_UPLOAD_SIZE_MB', 100),
};
