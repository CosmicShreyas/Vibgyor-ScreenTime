/**
 * Utility script to sync screenshot database with filesystem
 * Removes database records for screenshots that no longer exist on disk
 */

const fetch = require('node-fetch');

const SERVER_URL = 'http://localhost:5000';
const AUTH_TOKEN = 'vibgyorseek-dashboard-token-2024';

async function syncScreenshots() {
  try {
    console.log('🔄 Syncing screenshot database with filesystem...');
    
    const response = await fetch(`${SERVER_URL}/api/screenshots/sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const result = await response.json();
    console.log('✅ Sync completed successfully!');
    console.log(`📊 Removed ${result.removedCount} orphaned screenshot records`);
    
  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    process.exit(1);
  }
}

syncScreenshots();
