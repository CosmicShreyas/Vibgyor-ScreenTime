import { readFileSync } from 'fs';
import { join } from 'path';
import { database } from '../utils/database';
import { logger } from '../utils/logger';

/**
 * Run database migrations
 * Executes the schema.sql file to create tables and indexes
 */
export async function runMigrations(): Promise<void> {
  try {
    logger.info('Starting database migrations...');

    // Read the schema SQL file
    const schemaPath = join(__dirname, 'schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf-8');

    // Execute the schema
    await database.query(schemaSql);

    logger.info('Database migrations completed successfully');
  } catch (error) {
    logger.error('Database migration failed:', error);
    throw error;
  }
}

/**
 * Check if database tables exist
 */
export async function checkDatabaseSchema(): Promise<boolean> {
  try {
    const result = await database.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'employees'
      ) as employees_exists,
      EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'activity_logs'
      ) as activity_logs_exists,
      EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'screenshots'
      ) as screenshots_exists;
    `);

    const { employees_exists, activity_logs_exists, screenshots_exists } = result.rows[0];
    
    if (employees_exists && activity_logs_exists && screenshots_exists) {
      logger.info('Database schema is initialized');
      return true;
    } else {
      logger.warn('Database schema is not fully initialized');
      return false;
    }
  } catch (error) {
    logger.error('Error checking database schema:', error);
    return false;
  }
}

/**
 * Initialize database schema if not exists
 */
export async function initializeDatabase(): Promise<void> {
  const schemaExists = await checkDatabaseSchema();
  
  if (!schemaExists) {
    logger.info('Database schema not found, running migrations...');
    await runMigrations();
  } else {
    logger.info('Database schema already initialized');
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      logger.info('Database initialization complete');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Database initialization failed:', error);
      process.exit(1);
    });
}
