import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';

interface ServerConfig {
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

export class ServerConfigService {
  private envPath: string;

  constructor() {
    this.envPath = path.join(process.cwd(), '.env');
  }

  /**
   * Get current server configuration from environment variables
   */
  getCurrentConfig(): ServerConfig {
    return {
      PORT: process.env.PORT || '5000',
      NODE_ENV: process.env.NODE_ENV || 'development',
      MONGODB_URI: process.env.MONGODB_URI || '',
      SCREENSHOT_STORAGE_PATH: process.env.SCREENSHOT_STORAGE_PATH || './screenshots',
      SCREENSHOT_TTL_DAYS: process.env.SCREENSHOT_TTL_DAYS || '30',
      CLIENT_AUTH_TOKEN: process.env.CLIENT_AUTH_TOKEN || '',
      JWT_SECRET: process.env.JWT_SECRET || '',
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      SHIFT_START_HOUR: process.env.SHIFT_START_HOUR || '9',
      SHIFT_END_HOUR: process.env.SHIFT_END_HOUR || '20',
      FILE_UPLOAD_PATH: process.env.FILE_UPLOAD_PATH || './uploads',
      MAX_FILE_UPLOAD_SIZE_MB: process.env.MAX_FILE_UPLOAD_SIZE_MB || '100',
      EOD_REPORT_TIME: process.env.EOD_REPORT_TIME || '00:00',
    };
  }

  /**
   * Update .env file with new configuration
   */
  async updateEnvFile(config: ServerConfig): Promise<void> {
    logger.info('Updating .env file with new configuration');

    try {
      const envContent = `# Server Configuration
PORT=${config.PORT}
NODE_ENV=${config.NODE_ENV}

# MongoDB Configuration
MONGODB_URI=${config.MONGODB_URI}

# Screenshot Storage
SCREENSHOT_STORAGE_PATH=${config.SCREENSHOT_STORAGE_PATH}
SCREENSHOT_TTL_DAYS=${config.SCREENSHOT_TTL_DAYS}

# Authentication
CLIENT_AUTH_TOKEN=${config.CLIENT_AUTH_TOKEN}
JWT_SECRET=${config.JWT_SECRET}

# Logging
LOG_LEVEL=${config.LOG_LEVEL}

# Shift Time Configuration (24-hour format: 0-23)
# Timeline will display data between these hours
SHIFT_START_HOUR=${config.SHIFT_START_HOUR}
SHIFT_END_HOUR=${config.SHIFT_END_HOUR}

# File Upload Configuration
FILE_UPLOAD_PATH=${config.FILE_UPLOAD_PATH}
MAX_FILE_UPLOAD_SIZE_MB=${config.MAX_FILE_UPLOAD_SIZE_MB}

# EOD Reports Configuration
# Time to send daily End-of-Day reports (24-hour format HH:MM)
EOD_REPORT_TIME=${config.EOD_REPORT_TIME}
`;

      await fs.writeFile(this.envPath, envContent, 'utf-8');
      logger.info('✅ .env file updated successfully');
    } catch (error) {
      logger.error('Failed to update .env file:', error);
      throw new Error('Failed to update server configuration');
    }
  }

  /**
   * Reload environment variables from .env file
   */
  reloadEnvVariables(): void {
    logger.info('🔄 Reloading environment variables...');
    
    // Re-require dotenv to reload variables
    delete require.cache[require.resolve('dotenv')];
    require('dotenv').config({ override: true });
    
    const newConfig = this.getCurrentConfig();
    
    logger.info('✅ Environment variables reloaded:');
    logger.info(`   PORT: ${newConfig.PORT}`);
    logger.info(`   NODE_ENV: ${newConfig.NODE_ENV}`);
    logger.info(`   MONGODB_URI: ${newConfig.MONGODB_URI}`);
    logger.info(`   LOG_LEVEL: ${newConfig.LOG_LEVEL}`);
    logger.info(`   SCREENSHOT_TTL_DAYS: ${newConfig.SCREENSHOT_TTL_DAYS}`);
    logger.info(`   SHIFT_START_HOUR: ${newConfig.SHIFT_START_HOUR}`);
    logger.info(`   SHIFT_END_HOUR: ${newConfig.SHIFT_END_HOUR}`);
  }
}

export const serverConfigService = new ServerConfigService();
