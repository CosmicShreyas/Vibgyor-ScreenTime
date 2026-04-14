import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle, Clock, Image, FolderDown, Settings, Plus, Minus } from 'lucide-react';
import api from '../../services/api';

interface ClientConfig {
  SERVER_URL: string;
  AUTH_TOKEN: string;
  SCREENSHOT_INTERVAL_MINUTES: number;
  DATA_SEND_INTERVAL_MINUTES: number;
  LOCATION_UPDATE_INTERVAL_MINUTES: number;
  IDLE_THRESHOLD_SECONDS: number;
  APP_USAGE_POLL_INTERVAL_SECONDS: number;
  SCREENSHOT_QUALITY: number;
  LOG_LEVEL: string;
  FILE_DOWNLOAD_PATH: string;
}

const ConfigurationTab: React.FC = () => {
  const [config, setConfig] = useState<ClientConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await api.get('/client-env');
      setConfig(response.data);
    } catch (error) {
      console.error('Error fetching config:', error);
      showMessage('error', 'Failed to fetch configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    try {
      await api.put('/client-env', config);
      showMessage('success', 'Configuration saved! Clients will detect changes within 10 seconds.');
      await fetchConfig();
    } catch (error) {
      console.error('Error saving config:', error);
      showMessage('error', 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const updateConfig = (field: keyof ClientConfig, value: any) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  const incrementValue = (field: keyof ClientConfig, step: number = 1) => {
    if (!config) return;
    const currentValue = config[field] as number;
    setConfig({ ...config, [field]: currentValue + step });
  };

  const decrementValue = (field: keyof ClientConfig, step: number = 1, min: number = 1) => {
    if (!config) return;
    const currentValue = config[field] as number;
    const newValue = Math.max(min, currentValue - step);
    setConfig({ ...config, [field]: newValue });
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
          Global Client Configuration
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Configure monitoring settings for all connected clients. Changes will be applied after client restart.
        </p>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
          }`}
        >
          {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span>{message.text}</span>
        </div>
      )}

      {config && (
        <div className="space-y-6">
          {/* Interval Settings */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              Interval Settings
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Define capture frequency and idle threshold
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Take screenshots every */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Take screenshots every
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decrementValue('SCREENSHOT_INTERVAL_MINUTES', 1, 1)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={config.SCREENSHOT_INTERVAL_MINUTES}
                    onChange={(e) => updateConfig('SCREENSHOT_INTERVAL_MINUTES', Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 px-4 py-2 text-center border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    min="1"
                  />
                  <button
                    onClick={() => incrementValue('SCREENSHOT_INTERVAL_MINUTES', 1)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem]">min</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Recommended: every 10 min
                </p>
              </div>

              {/* App switch capture delay */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  App switch capture delay
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decrementValue('APP_USAGE_POLL_INTERVAL_SECONDS', 1, 2)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={config.APP_USAGE_POLL_INTERVAL_SECONDS}
                    onChange={(e) => updateConfig('APP_USAGE_POLL_INTERVAL_SECONDS', Math.max(2, parseInt(e.target.value) || 2))}
                    className="flex-1 px-4 py-2 text-center border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    min="2"
                  />
                  <button
                    onClick={() => incrementValue('APP_USAGE_POLL_INTERVAL_SECONDS', 1)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem]">sec</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Recommended: after an app switch 5 sec
                </p>
              </div>

              {/* Mark user idle after */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Mark user idle after
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decrementValue('IDLE_THRESHOLD_SECONDS', 30, 30)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={config.IDLE_THRESHOLD_SECONDS}
                    onChange={(e) => updateConfig('IDLE_THRESHOLD_SECONDS', Math.max(30, parseInt(e.target.value) || 30))}
                    className="flex-1 px-4 py-2 text-center border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    min="30"
                  />
                  <button
                    onClick={() => incrementValue('IDLE_THRESHOLD_SECONDS', 30)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem]">sec</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Recommended: after 5 or more sec
                </p>
              </div>

              {/* Data send interval */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Data send interval
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decrementValue('DATA_SEND_INTERVAL_MINUTES', 1, 1)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={config.DATA_SEND_INTERVAL_MINUTES}
                    onChange={(e) => updateConfig('DATA_SEND_INTERVAL_MINUTES', Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 px-4 py-2 text-center border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    min="1"
                  />
                  <button
                    onClick={() => incrementValue('DATA_SEND_INTERVAL_MINUTES', 1)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem]">min</span>
                </div>
              </div>
            </div>
          </div>

          {/* Screenshot Modes */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <Image className="w-5 h-5 text-purple-500" />
              Screenshot Modes
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Choose how Screentime captures your team's screen activity
            </p>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Screenshot Quality
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={config.SCREENSHOT_QUALITY}
                  onChange={(e) => updateConfig('SCREENSHOT_QUALITY', parseInt(e.target.value))}
                  className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${config.SCREENSHOT_QUALITY}%, #e5e7eb ${config.SCREENSHOT_QUALITY}%, #e5e7eb 100%)`
                  }}
                />
                <span className="text-lg font-semibold text-gray-900 dark:text-white min-w-[4rem] text-right">
                  {config.SCREENSHOT_QUALITY}%
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Adjust JPEG compression quality (1-100)
              </p>
            </div>
          </div>

          {/* OTA File Transfer */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <FolderDown className="w-5 h-5 text-green-500" />
              OTA File Transfer
            </h3>
            
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                File Download Path
              </label>
              <input
                type="text"
                value={config.FILE_DOWNLOAD_PATH}
                onChange={(e) => updateConfig('FILE_DOWNLOAD_PATH', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="C:\Downloads\CompanyFiles"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Where clients automatically save files sent via OTA
              </p>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <Settings className="w-5 h-5 text-orange-500" />
              Advanced Settings
            </h3>
            
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Log Level
                </label>
                <select
                  value={config.LOG_LEVEL}
                  onChange={(e) => updateConfig('LOG_LEVEL', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="DEBUG">DEBUG</option>
                  <option value="INFO">INFO</option>
                  <option value="WARNING">WARNING</option>
                  <option value="ERROR">ERROR</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Server URL
                </label>
                <input
                  type="text"
                  value={config.SERVER_URL}
                  onChange={(e) => updateConfig('SERVER_URL', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Location Update Interval (minutes)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => decrementValue('LOCATION_UPDATE_INTERVAL_MINUTES', 5, 5)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={config.LOCATION_UPDATE_INTERVAL_MINUTES}
                    onChange={(e) => updateConfig('LOCATION_UPDATE_INTERVAL_MINUTES', Math.max(5, parseInt(e.target.value) || 5))}
                    className="flex-1 px-4 py-2 text-center border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    min="5"
                  />
                  <button
                    onClick={() => incrementValue('LOCATION_UPDATE_INTERVAL_MINUTES', 5)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem]">min</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <button
              onClick={fetchConfig}
              className="px-6 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigurationTab;
