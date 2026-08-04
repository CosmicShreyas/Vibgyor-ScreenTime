/**
 * Script to check if client configurations exist in MongoDB
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Define the schema (same as in the app)
const clientConfigSchema = new mongoose.Schema({
  employeeName: { type: String, required: true, unique: true },
  serverUrl: { type: String, required: true },
  authToken: { type: String, required: true },
  screenshotIntervalMinutes: { type: Number, default: 10 },
  dataSendIntervalMinutes: { type: Number, default: 10 },
  locationUpdateIntervalMinutes: { type: Number, default: 30 },
  idleThresholdSeconds: { type: Number, default: 300 },
  appUsagePollIntervalSeconds: { type: Number, default: 10 },
  screenshotQuality: { type: Number, default: 75 },
  logLevel: { type: String, default: 'INFO' },
  fileDownloadPath: { type: String, default: 'C:\\Downloads\\CompanyFiles' },
  version: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const ClientConfig = mongoose.model('ClientConfig', clientConfigSchema);

async function checkConfigs() {
  try {
    console.log('='.repeat(70));
    console.log('MONGODB CLIENT CONFIGURATION CHECK');
    console.log('='.repeat(70));
    
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/employee-monitoring';
    console.log(`\n1. Connecting to MongoDB: ${mongoUri}`);
    
    await mongoose.connect(mongoUri);
    console.log('   ✅ Connected to MongoDB');
    
    // Get all configs
    console.log('\n2. Fetching all client configurations...');
    const configs = await ClientConfig.find({});
    
    console.log(`   📊 Found ${configs.length} configuration(s)`);
    
    if (configs.length === 0) {
      console.log('\n   ⚠️  WARNING: NO CONFIGURATIONS FOUND!');
      console.log('   This is why the client shows version 0');
      console.log('   The server returns default values when no config exists');
    } else {
      console.log('\n3. Configuration Details:');
      configs.forEach((config, index) => {
        console.log(`\n   Config ${index + 1}:`);
        console.log(`   - Employee Name: ${config.employeeName}`);
        console.log(`   - Version: ${config.version}`);
        console.log(`   - Screenshot Interval: ${config.screenshotIntervalMinutes} min`);
        console.log(`   - Data Send Interval: ${config.dataSendIntervalMinutes} min`);
        console.log(`   - Screenshot Quality: ${config.screenshotQuality}%`);
        console.log(`   - Updated At: ${config.updatedAt}`);
      });
    }
    
    // Check for specific employee
    const employeeName = 'Integration Test Employee';
    console.log(`\n4. Checking for "${employeeName}"...`);
    const specificConfig = await ClientConfig.findOne({ employeeName });
    
    if (specificConfig) {
      console.log('   ✅ Configuration exists!');
      console.log(`   Version: ${specificConfig.version}`);
    } else {
      console.log('   ❌ NO configuration found for this employee!');
      console.log('   This is the problem!');
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('SOLUTION');
    console.log('='.repeat(70));
    
    if (configs.length === 0 || !specificConfig) {
      console.log('\nTo create a configuration:');
      console.log('1. Open dashboard: http://localhost:5173');
      console.log('2. Login');
      console.log('3. Go to Settings → Configuration tab');
      console.log('4. Change any setting');
      console.log('5. Click "Save Configuration"');
      console.log('\nThis will create the config with version 1');
      console.log('The client will then detect and apply the update!');
    } else {
      console.log('\nConfiguration exists! The client should be able to detect updates.');
      console.log('If updates still don\'t work, check:');
      console.log('1. Is the client checking? (Look for "CONFIG WATCHER: Checking" messages)');
      console.log('2. Is the version incrementing when you save? (Check MongoDB)');
      console.log('3. Are there any errors in the server logs?');
    }
    
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

checkConfigs();
