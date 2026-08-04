import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcrypt';
import { logger } from '../utils/logger';

interface DashboardConfig {
  username: string;
  password: string; // hashed
  toastNotifications: boolean;
  restrictedMode: boolean;
  adminEmails: string[];
}

export class DashboardConfigService {
  private configPath: string;
  private config: DashboardConfig | null = null;

  constructor() {
    this.configPath = path.join(process.cwd(), 'dashboard-config.json');
  }

  /**
   * Load dashboard configuration from file
   */
  async loadConfig(): Promise<DashboardConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(data);
      return this.config!;
    } catch (error) {
      // If file doesn't exist, create default config
      logger.info('Dashboard config not found, creating default');
      const defaultPassword = await bcrypt.hash('admin123', 10);
      this.config = {
        username: 'admin',
        password: defaultPassword,
        toastNotifications: true,
        restrictedMode: false,
        adminEmails: [],
      };
      await this.saveConfig(this.config);
      return this.config;
    }
  }

  /**
   * Save dashboard configuration to file
   */
  private async saveConfig(config: DashboardConfig): Promise<void> {
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
    this.config = config;
  }

  /**
   * Get current dashboard configuration (without password)
   */
  async getCurrentConfig(): Promise<Omit<DashboardConfig, 'password'>> {
    const config = await this.loadConfig();
    return {
      username: config.username,
      toastNotifications: config.toastNotifications,
      restrictedMode: config.restrictedMode,
      adminEmails: config.adminEmails,
    };
  }

  /**
   * Update dashboard configuration
   */
  async updateConfig(updates: {
    username?: string;
    currentPassword?: string;
    newPassword?: string;
    toastNotifications?: boolean;
    restrictedMode?: boolean;
    adminEmails?: string[];
  }): Promise<{ credentialsChanged: boolean }> {
    const config = await this.loadConfig();
    let credentialsChanged = false;

    // Update username if provided
    if (updates.username && updates.username !== config.username) {
      config.username = updates.username;
      credentialsChanged = true;
      logger.info(`Dashboard username changed to: ${updates.username}`);
    }

    // Update password if provided
    if (updates.newPassword && updates.currentPassword) {
      // Verify current password
      const isValid = await bcrypt.compare(updates.currentPassword, config.password);
      if (!isValid) {
        throw new Error('Current password is incorrect');
      }

      // Hash and save new password
      config.password = await bcrypt.hash(updates.newPassword, 10);
      credentialsChanged = true;
      logger.info('Dashboard password changed');
    }

    // Update toast notifications
    if (updates.toastNotifications !== undefined) {
      config.toastNotifications = updates.toastNotifications;
    }

    // Update restricted mode
    if (updates.restrictedMode !== undefined) {
      config.restrictedMode = updates.restrictedMode;
      logger.info(`Restricted mode ${updates.restrictedMode ? 'enabled' : 'disabled'}`);
    }

    // Update admin emails
    if (updates.adminEmails !== undefined) {
      config.adminEmails = updates.adminEmails;
      logger.info(`Admin emails updated: ${updates.adminEmails.length} emails`);
    }

    await this.saveConfig(config);
    logger.info('Dashboard configuration updated successfully');

    return { credentialsChanged };
  }

  /**
   * Verify login credentials
   */
  async verifyCredentials(username: string, password: string): Promise<boolean> {
    const config = await this.loadConfig();
    
    if (username !== config.username) {
      return false;
    }

    return await bcrypt.compare(password, config.password);
  }
}

export const dashboardConfigService = new DashboardConfigService();
