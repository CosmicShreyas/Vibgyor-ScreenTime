import { ClientConfig, Employee } from '../database/schemas';
import { logger } from '../utils/logger';

export interface ClientConfigData {
  employee_name: string;
  server_url: string;
  auth_token: string;
  screenshot_interval_minutes: number;
  data_send_interval_minutes: number;
  location_update_interval_minutes: number;
  idle_threshold_seconds: number;
  app_usage_poll_interval_seconds: number;
  screenshot_quality: number;
  log_level: string;
  file_download_path: string;
  version: number;
  updated_at: Date;
}

class ConfigService {
  /**
   * Get default configuration values
   */
  getDefaultConfig(): Omit<ClientConfigData, 'employee_name' | 'version' | 'updated_at'> {
    return {
      server_url: process.env.CLIENT_SERVER_URL || 'http://localhost:5000/api/monitoring/data',
      auth_token: process.env.CLIENT_AUTH_TOKEN || 'vibgyorseek-client-token-2024',
      screenshot_interval_minutes: 10,
      data_send_interval_minutes: 10,
      location_update_interval_minutes: 30,
      idle_threshold_seconds: 300,
      app_usage_poll_interval_seconds: 10,
      screenshot_quality: 75,
      log_level: 'INFO',
      file_download_path: 'C:\\Downloads\\CompanyFiles'
    };
  }

  /**
   * Get client configuration for a specific employee
   */
  async getClientConfig(employeeName: string): Promise<ClientConfigData | null> {
    try {
      const config = await ClientConfig.findOne({ employeeName });

      if (!config) {
        // Return default config if no custom config exists
        const defaults = this.getDefaultConfig();
        return {
          employee_name: employeeName,
          ...defaults,
          version: 0,
          updated_at: new Date()
        };
      }

      // Convert MongoDB document to API format
      return {
        employee_name: config.employeeName,
        server_url: config.serverUrl,
        auth_token: config.authToken,
        screenshot_interval_minutes: config.screenshotIntervalMinutes,
        data_send_interval_minutes: config.dataSendIntervalMinutes,
        location_update_interval_minutes: config.locationUpdateIntervalMinutes,
        idle_threshold_seconds: config.idleThresholdSeconds,
        app_usage_poll_interval_seconds: config.appUsagePollIntervalSeconds,
        screenshot_quality: config.screenshotQuality,
        log_level: config.logLevel,
        file_download_path: config.fileDownloadPath,
        version: config.version,
        updated_at: config.updatedAt
      };
    } catch (error) {
      logger.error('Error fetching client config:', error);
      throw error;
    }
  }

  /**
   * Update client configuration
   */
  async updateClientConfig(
    employeeName: string,
    configUpdate: Partial<Omit<ClientConfigData, 'employee_name' | 'version' | 'updated_at'>>
  ): Promise<void> {
    try {
      const defaults = this.getDefaultConfig();
      
      // Convert API format to MongoDB format
      const updateData: any = {};
      
      if (configUpdate.server_url !== undefined) updateData.serverUrl = configUpdate.server_url;
      if (configUpdate.auth_token !== undefined) updateData.authToken = configUpdate.auth_token;
      if (configUpdate.screenshot_interval_minutes !== undefined) 
        updateData.screenshotIntervalMinutes = configUpdate.screenshot_interval_minutes;
      if (configUpdate.data_send_interval_minutes !== undefined) 
        updateData.dataSendIntervalMinutes = configUpdate.data_send_interval_minutes;
      if (configUpdate.location_update_interval_minutes !== undefined) 
        updateData.locationUpdateIntervalMinutes = configUpdate.location_update_interval_minutes;
      if (configUpdate.idle_threshold_seconds !== undefined) 
        updateData.idleThresholdSeconds = configUpdate.idle_threshold_seconds;
      if (configUpdate.app_usage_poll_interval_seconds !== undefined) 
        updateData.appUsagePollIntervalSeconds = configUpdate.app_usage_poll_interval_seconds;
      if (configUpdate.screenshot_quality !== undefined) 
        updateData.screenshotQuality = configUpdate.screenshot_quality;
      if (configUpdate.log_level !== undefined) updateData.logLevel = configUpdate.log_level;
      if (configUpdate.file_download_path !== undefined) 
        updateData.fileDownloadPath = configUpdate.file_download_path;

      // Find existing config or create new one
      const existingConfig = await ClientConfig.findOne({ employeeName });

      if (existingConfig) {
        // Update existing config and increment version
        Object.assign(existingConfig, updateData);
        existingConfig.version += 1;
        await existingConfig.save();
      } else {
        // Create new config with defaults
        const newConfig = new ClientConfig({
          employeeName,
          serverUrl: configUpdate.server_url || defaults.server_url,
          authToken: configUpdate.auth_token || defaults.auth_token,
          screenshotIntervalMinutes: configUpdate.screenshot_interval_minutes || defaults.screenshot_interval_minutes,
          dataSendIntervalMinutes: configUpdate.data_send_interval_minutes || defaults.data_send_interval_minutes,
          locationUpdateIntervalMinutes: configUpdate.location_update_interval_minutes || defaults.location_update_interval_minutes,
          idleThresholdSeconds: configUpdate.idle_threshold_seconds || defaults.idle_threshold_seconds,
          appUsagePollIntervalSeconds: configUpdate.app_usage_poll_interval_seconds || defaults.app_usage_poll_interval_seconds,
          screenshotQuality: configUpdate.screenshot_quality || defaults.screenshot_quality,
          logLevel: configUpdate.log_level || defaults.log_level,
          fileDownloadPath: configUpdate.file_download_path || defaults.file_download_path,
          version: 1
        });
        await newConfig.save();
      }

      logger.info('Client configuration updated', { employee: employeeName });
    } catch (error) {
      logger.error('Error updating client config:', error);
      throw error;
    }
  }

  /**
   * Get configuration version for change detection
   */
  async getConfigVersion(employeeName: string): Promise<number> {
    try {
      const config = await ClientConfig.findOne({ employeeName }).select('version');
      return config ? config.version : 0;
    } catch (error) {
      logger.error('Error fetching config version:', error);
      throw error;
    }
  }

  /**
   * Update global configuration for all clients
   */
  async updateGlobalConfig(
    configUpdate: Partial<Omit<ClientConfigData, 'employee_name' | 'version' | 'updated_at'>>
  ): Promise<void> {
    try {
      const defaults = this.getDefaultConfig();
      
      // Convert API format to MongoDB format
      const updateData: any = {};
      
      if (configUpdate.server_url !== undefined) updateData.serverUrl = configUpdate.server_url;
      if (configUpdate.auth_token !== undefined) updateData.authToken = configUpdate.auth_token;
      if (configUpdate.screenshot_interval_minutes !== undefined) 
        updateData.screenshotIntervalMinutes = configUpdate.screenshot_interval_minutes;
      if (configUpdate.data_send_interval_minutes !== undefined) 
        updateData.dataSendIntervalMinutes = configUpdate.data_send_interval_minutes;
      if (configUpdate.location_update_interval_minutes !== undefined) 
        updateData.locationUpdateIntervalMinutes = configUpdate.location_update_interval_minutes;
      if (configUpdate.idle_threshold_seconds !== undefined) 
        updateData.idleThresholdSeconds = configUpdate.idle_threshold_seconds;
      if (configUpdate.app_usage_poll_interval_seconds !== undefined) 
        updateData.appUsagePollIntervalSeconds = configUpdate.app_usage_poll_interval_seconds;
      if (configUpdate.screenshot_quality !== undefined) 
        updateData.screenshotQuality = configUpdate.screenshot_quality;
      if (configUpdate.log_level !== undefined) updateData.logLevel = configUpdate.log_level;
      if (configUpdate.file_download_path !== undefined) 
        updateData.fileDownloadPath = configUpdate.file_download_path;

      // Check if any configs exist
      const existingConfigs = await ClientConfig.find({});
      
      if (existingConfigs.length > 0) {
        // Update all existing configs and increment version
        await ClientConfig.updateMany(
          {},
          {
            $set: updateData,
            $inc: { version: 1 }
          }
        );
        logger.info(`Global configuration updated for ${existingConfigs.length} existing client(s)`);
      } else {
        // No configs exist - create default configs for all employees that have sent data
        logger.info('No client configurations exist, creating default configs for all employees');
        
        // Get list of all employees
        const employees = await Employee.find({}).select('name');
        
        if (employees.length === 0) {
          logger.warning('No employees found in database, cannot create configurations');
          logger.info('Configuration will be created when employees start sending data');
          return;
        }
        
        // Create config for each employee
        const configPromises = employees.map(async (employee) => {
          const newConfig = new ClientConfig({
            employeeName: employee.name,
            serverUrl: configUpdate.server_url || defaults.server_url,
            authToken: configUpdate.auth_token || defaults.auth_token,
            screenshotIntervalMinutes: configUpdate.screenshot_interval_minutes || defaults.screenshot_interval_minutes,
            dataSendIntervalMinutes: configUpdate.data_send_interval_minutes || defaults.data_send_interval_minutes,
            locationUpdateIntervalMinutes: configUpdate.location_update_interval_minutes || defaults.location_update_interval_minutes,
            idleThresholdSeconds: configUpdate.idle_threshold_seconds || defaults.idle_threshold_seconds,
            appUsagePollIntervalSeconds: configUpdate.app_usage_poll_interval_seconds || defaults.app_usage_poll_interval_seconds,
            screenshotQuality: configUpdate.screenshot_quality || defaults.screenshot_quality,
            logLevel: configUpdate.log_level || defaults.log_level,
            fileDownloadPath: configUpdate.file_download_path || defaults.file_download_path,
            version: 1
          });
          return newConfig.save();
        });
        
        await Promise.all(configPromises);
        logger.info(`Created configurations for ${employees.length} employee(s)`);
      }

      logger.info('Global configuration update completed');
    } catch (error) {
      logger.error('Error updating global config:', error);
      throw error;
    }
  }
}

export const configService = new ConfigService();
