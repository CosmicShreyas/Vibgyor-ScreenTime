import * as chokidar from 'chokidar';
import path from 'path';
import { logger } from './logger';
import { serverConfigService } from '../services/server-config.service';

let watcher: chokidar.FSWatcher | null = null;
let reloadTimeout: NodeJS.Timeout | null = null;

/**
 * Start watching .env file for changes and hot-reload configuration
 */
export function startEnvWatcher(): void {
  const envPath = path.join(process.cwd(), '.env');
  
  logger.info('👁️  Starting .env file watcher for hot-reload...');
  
  watcher = chokidar.watch(envPath, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100
    }
  });

  watcher.on('change', (filePath) => {
    logger.info(`📝 .env file changed: ${filePath}`);
    
    // Debounce: wait 1 second before reloading to avoid multiple rapid changes
    if (reloadTimeout) {
      clearTimeout(reloadTimeout);
    }
    
    reloadTimeout = setTimeout(() => {
      try {
        console.log('\n' + '='.repeat(60));
        console.log('🔄 HOT-RELOAD: .env file changed, reloading configuration...');
        console.log('='.repeat(60));
        
        serverConfigService.reloadEnvVariables();
        
        console.log('='.repeat(60));
        console.log('✅ Configuration hot-reloaded successfully!');
        console.log('='.repeat(60) + '\n');
      } catch (error) {
        logger.error('❌ Error during hot-reload:', error);
        console.error('❌ Configuration reload failed:', error);
      }
    }, 1000);
  });

  watcher.on('error', (error) => {
    logger.error('Error watching .env file:', error);
  });

  logger.info('✅ .env file watcher started successfully');
}

/**
 * Stop watching .env file
 */
export function stopEnvWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    logger.info('🛑 .env file watcher stopped');
  }
  
  if (reloadTimeout) {
    clearTimeout(reloadTimeout);
    reloadTimeout = null;
  }
}
