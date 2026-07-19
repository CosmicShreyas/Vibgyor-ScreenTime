import { logger } from './logger';

/**
 * Database error codes that should trigger a retry
 * These are transient errors that may succeed on retry
 */
const RETRYABLE_ERROR_CODES = [
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
  '40001', // serialization_failure
  '40P01', // deadlock_detected
];

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: any): boolean {
  if (!error) return false;
  
  // Check for PostgreSQL error codes
  if (error.code && RETRYABLE_ERROR_CODES.includes(error.code)) {
    return true;
  }
  
  // Check for connection timeout errors (case-insensitive)
  if (error.message) {
    const message = error.message.toLowerCase();
    if (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('etimedout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    ) {
      return true;
    }
  }
  
  return false;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Retry a database operation with exponential backoff
 * 
 * @param operation - Async function to retry
 * @param config - Retry configuration
 * @returns Result of the operation
 * @throws Last error if all retries fail
 */
export async function retryDatabaseOperation<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Attempt the operation
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      if (attempt < config.maxRetries && isRetryableError(error)) {
        const delay = calculateDelay(attempt, config);
        
        logger.warn('Database operation failed, retrying...', {
          attempt: attempt + 1,
          maxRetries: config.maxRetries,
          delayMs: delay,
          error: error instanceof Error ? error.message : 'Unknown error',
          errorCode: (error as any)?.code,
        });
        
        // Wait before retrying
        await sleep(delay);
      } else {
        // Don't retry - either max retries reached or non-retryable error
        if (attempt >= config.maxRetries) {
          logger.error('Database operation failed after max retries', {
            attempts: attempt + 1,
            error: error instanceof Error ? error.message : 'Unknown error',
            errorCode: (error as any)?.code,
          });
        }
        throw error;
      }
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Wrapper for database queries with automatic retry
 * 
 * @param queryFn - Function that executes the database query
 * @param config - Optional retry configuration
 * @returns Query result
 */
export async function withRetry<T>(
  queryFn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  return retryDatabaseOperation(queryFn, fullConfig);
}
