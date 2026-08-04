/**
 * Database module exports
 */
import { dbConnection } from './connection';
export { dbConnection };
export { Employee, ActivityLog, Screenshot, ServerConfigModel } from './schemas';
export type { IEmployee, IActivityLog, IScreenshot, IServerConfig } from './schemas';

/**
 * Initialize database connection
 */
export async function initializeDatabase(): Promise<void> {
  await dbConnection.connect();
}
