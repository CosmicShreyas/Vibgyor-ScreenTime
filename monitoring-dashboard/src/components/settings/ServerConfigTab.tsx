import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, Eye, EyeOff } from 'lucide-react';
import api from '../../services/api';

interface ServerConfig {
  port: string;
  nodeEnv: string;
  mongodbUri: string;
  screenshotStoragePath: string;
  screenshotTtlDays: string;
  clientAuthToken: string;
  jwtSecret: string;
  logLevel: string;
  shiftStartHour: string;
  shiftEndHour: string;
  fileUploadPath: string;
  maxFileUploadSizeMb: string;
  eodReportTime: string;
}

const ServerConfigTab: React.FC = () => {
  const [config, setConfig] = useState<ServerConfig>({
    port: '5000',
    nodeEnv: 'development',
    mongodbUri: 'mongodb://localhost:27017/screentime_monitoring',
    screenshotStoragePath: './screenshots',
    screenshotTtlDays: '30',
    clientAuthToken: 'screentime-client-token-2024',
    jwtSecret: 'screentime-jwt-secret-key-2024',
    logLevel: 'info',
    shiftStartHour: '9',
    shiftEndHour: '20',
    fileUploadPath: './uploads',
    maxFileUploadSizeMb: '100',
    eodReportTime: '00:00',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSecrets, setShowSecrets] = useState({
    clientAuthToken: false,
    jwtSecret: false,
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await api.get('/server-config');
      const data = response.data;
      
      setConfig({
        port: data.PORT,
        nodeEnv: data.NODE_ENV,
        mongodbUri: data.MONGODB_URI,
        screenshotStoragePath: data.SCREENSHOT_STORAGE_PATH,
        screenshotTtlDays: data.SCREENSHOT_TTL_DAYS,
        clientAuthToken: data.CLIENT_AUTH_TOKEN,
        jwtSecret: data.JWT_SECRET,
        logLevel: data.LOG_LEVEL,
        shiftStartHour: data.SHIFT_START_HOUR,
        shiftEndHour: data.SHIFT_END_HOUR,
        fileUploadPath: data.FILE_UPLOAD_PATH,
        maxFileUploadSizeMb: data.MAX_FILE_UPLOAD_SIZE_MB,
        eodReportTime: data.EOD_REPORT_TIME || '00:00',
      });
    } catch (error) {
      showMessage('error', 'Failed to fetch server configuration');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleChange = (field: keyof ServerConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const toggleSecretVisibility = (field: 'clientAuthToken' | 'jwtSecret') => {
    setShowSecrets(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    
    try {
      const payload = {
        PORT: config.port,
        NODE_ENV: config.nodeEnv,
        MONGODB_URI: config.mongodbUri,
        SCREENSHOT_STORAGE_PATH: config.screenshotStoragePath,
        SCREENSHOT_TTL_DAYS: config.screenshotTtlDays,
        CLIENT_AUTH_TOKEN: config.clientAuthToken,
        JWT_SECRET: config.jwtSecret,
        LOG_LEVEL: config.logLevel,
        SHIFT_START_HOUR: config.shiftStartHour,
        SHIFT_END_HOUR: config.shiftEndHour,
        FILE_UPLOAD_PATH: config.fileUploadPath,
        MAX_FILE_UPLOAD_SIZE_MB: config.maxFileUploadSizeMb,
        EOD_REPORT_TIME: config.eodReportTime,
      };
      
      await api.put('/server-config', payload);
      showMessage('success', 'Server configuration saved successfully! Hot-reload will apply changes automatically.');
    } catch (error) {
      showMessage('error', 'Failed to save server configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Server Configuration
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Configure server API environment variables and reload the server
        </p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
          message.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' 
            : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
        }`}>
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* Server Settings */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Server Settings
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Server Port
              </label>
              <input
                type="number"
                value={config.port}
                onChange={(e) => handleChange('port', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Port number for the API server
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Node Environment
              </label>
              <select
                value={config.nodeEnv}
                onChange={(e) => handleChange('nodeEnv', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="development">Development</option>
                <option value="production">Production</option>
                <option value="test">Test</option>
              </select>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Application environment mode
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Log Level
              </label>
              <select
                value={config.logLevel}
                onChange={(e) => handleChange('logLevel', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="error">Error</option>
                <option value="warn">Warn</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </select>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Logging verbosity level
              </p>
            </div>
          </div>
        </div>

        {/* Database Configuration */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Database Configuration
          </h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              MongoDB URI
            </label>
            <input
              type="text"
              value={config.mongodbUri}
              onChange={(e) => handleChange('mongodbUri', e.target.value)}
              placeholder="mongodb://localhost:27017/database"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              MongoDB connection string
            </p>
          </div>
        </div>

        {/* Authentication */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Authentication
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Client Auth Token
              </label>
              <div className="relative">
                <input
                  type={showSecrets.clientAuthToken ? 'text' : 'password'}
                  value={config.clientAuthToken}
                  onChange={(e) => handleChange('clientAuthToken', e.target.value)}
                  placeholder="Enter client authentication token"
                  className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => toggleSecretVisibility('clientAuthToken')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showSecrets.clientAuthToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Token for client authentication
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                JWT Secret
              </label>
              <div className="relative">
                <input
                  type={showSecrets.jwtSecret ? 'text' : 'password'}
                  value={config.jwtSecret}
                  onChange={(e) => handleChange('jwtSecret', e.target.value)}
                  placeholder="Enter JWT secret key"
                  className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => toggleSecretVisibility('jwtSecret')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showSecrets.jwtSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Secret key for JWT token generation
              </p>
            </div>
          </div>
        </div>

        {/* Screenshot Configuration */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Screenshot Configuration
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Storage Path
              </label>
              <input
                type="text"
                value={config.screenshotStoragePath}
                onChange={(e) => handleChange('screenshotStoragePath', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Directory path for screenshot storage
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Screenshot TTL (Days)
              </label>
              <input
                type="number"
                value={config.screenshotTtlDays}
                onChange={(e) => handleChange('screenshotTtlDays', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Days to keep screenshots before deletion
              </p>
            </div>
          </div>
        </div>

        {/* Shift Time Configuration */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Shift Time Configuration
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Shift Start Hour (0-23)
              </label>
              <input
                type="number"
                min="0"
                max="23"
                value={config.shiftStartHour}
                onChange={(e) => handleChange('shiftStartHour', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Timeline start hour (24-hour format)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Shift End Hour (0-23)
              </label>
              <input
                type="number"
                min="0"
                max="23"
                value={config.shiftEndHour}
                onChange={(e) => handleChange('shiftEndHour', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Timeline end hour (24-hour format)
              </p>
            </div>
          </div>
        </div>

        {/* File Upload Configuration */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            File Upload Configuration
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Upload Path
              </label>
              <input
                type="text"
                value={config.fileUploadPath}
                onChange={(e) => handleChange('fileUploadPath', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Directory path for file uploads
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Max Upload Size (MB)
              </label>
              <input
                type="number"
                value={config.maxFileUploadSizeMb}
                onChange={(e) => handleChange('maxFileUploadSizeMb', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Maximum file upload size in megabytes
              </p>
            </div>
          </div>
        </div>

        {/* EOD Reports Configuration */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            EOD Reports Configuration
          </h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Daily Report Time (HH:MM)
            </label>
            <input
              type="time"
              value={config.eodReportTime}
              onChange={(e) => handleChange('eodReportTime', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Time to send daily End-of-Day reports (24-hour format). Default is 00:00 (midnight).
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        {/* Action Button */}
        <div className="flex gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 
                     text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Saving & Reloading...' : 'Save & Reload Server'}
          </button>
        </div>

        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Hot-Reload Enabled:</strong> Changes will be automatically applied when you save. 
            The server will reload configuration without restarting.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ServerConfigTab;
