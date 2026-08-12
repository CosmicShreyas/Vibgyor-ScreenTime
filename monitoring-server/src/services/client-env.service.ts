import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

const CLIENT_ENV_PATH = path.join(__dirname, '../../client_config/.env');

export interface ClientEnvConfig {
  SERVER_URL: string;
  AUTH_TOKEN: string;
  SCREENSHOT_INTERVAL_MINUTES: number;
  DATA_SEND_INTERVAL_MINUTES: number;
  LOCATION_UPDATE_INTERVAL_MINUTES: number;
  IDLE_THRESHOLD_SECONDS: number;
  APP_USAGE_POLL_INTERVAL_SECONDS: number;
  SCREENSHOT_QUALITY: number;
  LOG_LEVEL: string;
  FILE_DOWNLOAD_PATH: string;
}

class ClientEnvService {
  /**
   * Read the client .env file
   */
  readClientEnv(): ClientEnvConfig {
    try {
      const content = fs.readFileSync(CLIENT_ENV_PATH, 'utf-8');
      const config: any = {};
      
      content.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          const [key, ...valueParts] = line.split('=');
          const value = valueParts.join('=').trim();
          
          if (key && value) {
            // Parse numbers
            if (key.includes('MINUTES') || key.includes('SECONDS') || key.includes('QUALITY')) {
              config[key] = parseInt(value, 10);
            } else {
              config[key] = value;
            }
          }
        }
      });
      
      return config as ClientEnvConfig;
    } catch (error) {
      logger.error('Error reading client .env file:', error);
      throw new Error('Failed to read client configuration');
    }
  }

  /**
   * Write the client .env file
   */
  writeClientEnv(config: Partial<ClientEnvConfig>): void {
    try {
      // Read current config
      const currentConfig = this.readClientEnv();
      
      // Merge with updates
      const updatedConfig = { ...currentConfig, ...config };
      
      // Build .env content
      const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const content = `# Auto-generated client configuration
# Last updated: ${timestamp}

SERVER_URL=${updatedConfig.SERVER_URL}
AUTH_TOKEN=${updatedConfig.AUTH_TOKEN}

# Intervals
SCREENSHOT_INTERVAL_MINUTES=${updatedConfig.SCREENSHOT_INTERVAL_MINUTES}
DATA_SEND_INTERVAL_MINUTES=${updatedConfig.DATA_SEND_INTERVAL_MINUTES}
LOCATION_UPDATE_INTERVAL_MINUTES=${updatedConfig.LOCATION_UPDATE_INTERVAL_MINUTES}

# Activity Tracking
IDLE_THRESHOLD_SECONDS=${updatedConfig.IDLE_THRESHOLD_SECONDS}
APP_USAGE_POLL_INTERVAL_SECONDS=${updatedConfig.APP_USAGE_POLL_INTERVAL_SECONDS}

# Screenshot Settings
SCREENSHOT_QUALITY=${updatedConfig.SCREENSHOT_QUALITY}

# Logging
LOG_LEVEL=${updatedConfig.LOG_LEVEL}

# OTA File Transfer Configuration
FILE_DOWNLOAD_PATH=${updatedConfig.FILE_DOWNLOAD_PATH}
`;
      
      // Write to file
      fs.writeFileSync(CLIENT_ENV_PATH, content, 'utf-8');
      logger.info('Client .env file updated successfully');
    } catch (error) {
      logger.error('Error writing client .env file:', error);
      throw new Error('Failed to write client configuration');
    }
  }

  /**
   * Get the raw .env file content
   */
  getRawEnvContent(): string {
    try {
      return fs.readFileSync(CLIENT_ENV_PATH, 'utf-8');
    } catch (error) {
      logger.error('Error reading raw client .env file:', error);
      throw new Error('Failed to read client configuration');
    }
  }
}

export const clientEnvService = new ClientEnvService();
