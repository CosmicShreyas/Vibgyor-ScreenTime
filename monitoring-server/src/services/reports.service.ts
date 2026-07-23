import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

interface ReportsConfig {
  enabled: boolean;
  recipients: string[];
  schedule: 'weekly' | 'monthly';
  dayOfWeek: number; // 0-6, where 0 is Sunday
  timeOfDay: string; // HH:MM format
}

const CONFIG_FILE = path.join(process.cwd(), 'reports-config.json');

export class ReportsService {
  private config: ReportsConfig | null = null;

  /**
   * Load reports configuration from file
   */
  async loadConfig(): Promise<ReportsConfig> {
    try {
      const data = await fs.readFile(CONFIG_FILE, 'utf-8');
      this.config = JSON.parse(data);
      logger.info('📋 Reports configuration loaded');
      return this.config!;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create default config
        this.config = {
          enabled: false,
          recipients: [],
          schedule: 'weekly',
          dayOfWeek: 1, // Monday
          timeOfDay: '09:00',
        };
        await this.saveConfig(this.config);
        logger.info('📋 Created default reports configuration');
        return this.config;
      }
      logger.error('Failed to load reports configuration:', error);
      throw error;
    }
  }

  /**
   * Save reports configuration to file
   */
  async saveConfig(config: ReportsConfig): Promise<void> {
    try {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
      this.config = config;
      logger.info('📋 Reports configuration saved');
    } catch (error) {
      logger.error('Failed to save reports configuration:', error);
      throw error;
    }
  }

  /**
   * Get current reports configuration
   */
  async getConfig(): Promise<ReportsConfig> {
    if (!this.config) {
      return await this.loadConfig();
    }
    return this.config;
  }

  /**
   * Update reports configuration
   */
  async updateConfig(updates: Partial<ReportsConfig>): Promise<ReportsConfig> {
    const currentConfig = await this.getConfig();
    const newConfig = { ...currentConfig, ...updates };

    // Validate recipients
    if (newConfig.recipients.length > 5) {
      throw new Error('Maximum 5 recipients allowed');
    }

    // Validate email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of newConfig.recipients) {
      if (!emailRegex.test(email)) {
        throw new Error(`Invalid email address: ${email}`);
      }
    }

    await this.saveConfig(newConfig);
    return newConfig;
  }

  /**
   * Add recipient email
   */
  async addRecipient(email: string): Promise<ReportsConfig> {
    const config = await this.getConfig();
    
    if (config.recipients.length >= 5) {
      throw new Error('Maximum 5 recipients allowed');
    }

    if (config.recipients.includes(email)) {
      throw new Error('Email already exists in recipients list');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email address');
    }

    config.recipients.push(email);
    await this.saveConfig(config);
    return config;
  }

  /**
   * Remove recipient email
   */
  async removeRecipient(email: string): Promise<ReportsConfig> {
    const config = await this.getConfig();
    config.recipients = config.recipients.filter(e => e !== email);
    await this.saveConfig(config);
    return config;
  }

  /**
   * Toggle reports enabled/disabled
   */
  async toggleEnabled(enabled: boolean): Promise<ReportsConfig> {
    const config = await this.getConfig();
    config.enabled = enabled;
    await this.saveConfig(config);
    return config;
  }
}

export const reportsService = new ReportsService();
