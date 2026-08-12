/**
 * Legacy PostgreSQL database module - DEPRECATED
 * This file is kept for backward compatibility with services not yet migrated to MongoDB
 * New code should use the MongoDB connection from src/database/connection.ts
 */

import { logger } from './logger';

/**
 * @deprecated Use MongoDB connection instead
 */
export class Database {
  constructor() {
    logger.warn('PostgreSQL Database class is deprecated. Use MongoDB connection instead.');
  }

  async query(_sql?: string, _params?: any[]): Promise<any> {
    throw new Error('PostgreSQL is no longer supported. Please use MongoDB.');
  }

  async getClient(): Promise<any> {
    throw new Error('PostgreSQL is no longer supported. Please use MongoDB.');
  }

  async transaction(_callback: any): Promise<any> {
    throw new Error('PostgreSQL transactions are no longer supported. Please use MongoDB.');
  }

  getPoolStats(): any {
    return {
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    };
  }

  async close(): Promise<void> {
    logger.info('PostgreSQL database close called (no-op)');
  }
}

/**
 * @deprecated Use MongoDB connection instead
 */
export const database = new Database();
