/**
 * Database module exports
 */
import { dbConnection } from './connection';
export { dbConnection };
export { Employee, ActivityLog, Screenshot, ServerConfigModel, ServerStatistic } from './schemas';
export type { IEmployee, IActivityLog, IScreenshot, IServerConfig, IServerStatistic } from './schemas';

/**
 * Initialize database connection
 */
export async function initializeDatabase(): Promise<void> {
  await dbConnection.connect();
}
