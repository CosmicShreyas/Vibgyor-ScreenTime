import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, Eye, EyeOff, Bell, BellOff, Lock, Unlock, Mail, Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useRestrictedMode } from '../../contexts/RestrictedModeContext';

const DashboardConfigTab: React.FC = () => {
  const { refreshRestrictedMode } = useRestrictedMode();
  const [config, setConfig] = useState({
    username: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    toastNotifications: true,
    restrictedMode: false,
    adminEmails: [] as string[],
  });
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (countdown !== null && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      handleLogout();
    }
  }, [countdown]);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await api.get('/dashboard-config');
      setConfig(prev => ({
        ...prev,
        username: response.data.username,
        toastNotifications: response.data.toastNotifications,
        restrictedMode: response.data.restrictedMode,
        adminEmails: response.data.adminEmails || [],
      }));
    } catch (error) {
      showMessage('error', 'Failed to fetch dashboard configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.href = '/login';
  };

  const handleChange = (field: string, value: string | boolean | string[]) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleAddAdminEmail = () => {
    if (!newAdminEmail) {
      toast.error('Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newAdminEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (config.adminEmails.includes(newAdminEmail)) {
      toast.error('Email already added');
      return;
    }

    if (config.adminEmails.length >= 5) {
      toast.error('Maximum 5 admin emails allowed');
      return;
    }

    handleChange('adminEmails', [...config.adminEmails, newAdminEmail]);
    setNewAdminEmail('');
    toast.success('Admin email added');
  };

  const handleRemoveAdminEmail = (email: string) => {
    handleChange('adminEmails', config.adminEmails.filter(e => e !== email));
    toast.success('Admin email removed');
  };

  const togglePasswordVisibility = (field: 'current' | 'new' | 'confirm') => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    // Validation
    if (config.newPassword && config.newPassword !== config.confirmPassword) {
      showMessage('error', 'New passwords do not match');
      setSaving(false);
      return;
    }

    if (config.newPassword && config.newPassword.length < 6) {
      showMessage('error', 'Password must be at least 6 characters');
      setSaving(false);
      return;
    }

    if (config.newPassword && !config.currentPassword) {
      showMessage('error', 'Current password is required to change password');
      setSaving(false);
      return;
    }

    try {
      const updates: any = {
        username: config.username,
        toastNotifications: config.toastNotifications,
        restrictedMode: config.restrictedMode,
        adminEmails: config.adminEmails,
      };

      if (config.newPassword && config.currentPassword) {
        updates.currentPassword = config.currentPassword;
        updates.newPassword = config.newPassword;
      }

      const response = await api.put('/dashboard-config', updates);
      
      if (response.data.credentialsChanged) {
        // Credentials changed - start countdown and logout
        setMessage({ 
          type: 'success', 
          text: 'Login credentials changed! You will be logged out in 3 seconds...' 
        });
        setCountdown(3);
      } else {
        showMessage('success', 'Dashboard configuration saved successfully!');
        // Clear password fields
        setConfig(prev => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        }));
        // Refresh restricted mode state
        refreshRestrictedMode();
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to save dashboard configuration';
      showMessage('error', errorMessage);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Dashboard Configuration
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Manage dashboard credentials and notification preferences
        </p>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${
          message.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' 
            : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
        }`}>
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <span>{message.text}</span>
            {countdown !== null && countdown > 0 && (
              <div className="mt-2 text-lg font-bold">
                Logging out in {countdown}...
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-8">
        {/* Account Settings */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Account Settings
          </h3>
          
          <div className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Username
              </label>
              <input
                type="text"
                value={config.username}
                onChange={(e) => handleChange('username', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Current Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showPasswords.current ? 'text' : 'password'}
                  value={config.currentPassword}
                  onChange={(e) => handleChange('currentPassword', e.target.value)}
                  placeholder="Enter current password to change"
                  className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('current')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showPasswords.current ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPasswords.new ? 'text' : 'password'}
                  value={config.newPassword}
                  onChange={(e) => handleChange('newPassword', e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                  className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('new')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showPasswords.new ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={config.confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('confirm')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showPasswords.confirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Notification Preferences
          </h3>
          
          <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-700 rounded-lg">
            <div className="flex items-center gap-3">
              {config.toastNotifications ? (
                <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              ) : (
                <BellOff className="w-5 h-5 text-gray-400" />
              )}
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Toast Notifications
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Show popup notifications for important events
                </p>
              </div>
            </div>
            <button
              onClick={() => handleChange('toastNotifications', !config.toastNotifications)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.toastNotifications ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.toastNotifications ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Restricted Mode */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5 text-red-600 dark:text-red-400" />
            Restricted Mode
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            When enabled, the Settings page will be hidden and require OTP verification to access
          </p>
          
          <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-700 rounded-lg mb-4">
            <div className="flex items-center gap-3">
              {config.restrictedMode ? (
                <Lock className="w-5 h-5 text-red-600 dark:text-red-400" />
              ) : (
                <Unlock className="w-5 h-5 text-green-600 dark:text-green-400" />
              )}
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Enable Restricted Mode
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Protect settings with OTP verification
                </p>
              </div>
            </div>
            <button
              onClick={() => handleChange('restrictedMode', !config.restrictedMode)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.restrictedMode ? 'bg-red-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.restrictedMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Admin Emails */}
          <div className="bg-white dark:bg-gray-700 p-4 rounded-lg">
            <h4 className="font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Admin Email Addresses
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Add up to 5 email addresses to receive OTP for unlocking restricted mode
            </p>

            {/* Add Email Input */}
            <div className="flex gap-2 mb-3">
              <input
                type="email"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddAdminEmail()}
                placeholder="Enter admin email address"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleAddAdminEmail}
                disabled={!newAdminEmail || config.adminEmails.length >= 5}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg 
                         flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>

            {/* Email List */}
            {config.adminEmails.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Admin Emails ({config.adminEmails.length}/5):
                </p>
                {config.adminEmails.map((email) => (
                  <div
                    key={email}
                    className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="w-3 h-3 text-gray-400" />
                      <span className="text-sm text-gray-900 dark:text-white">{email}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveAdminEmail(email)}
                      className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                <Mail className="w-8 h-8 mx-auto mb-1 opacity-50" />
                <p>No admin emails added yet</p>
              </div>
            )}
          </div>

          {config.restrictedMode && config.adminEmails.length === 0 && (
            <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Warning: Add at least one admin email before enabling restricted mode, or you won't be able to unlock it!
              </p>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSave}
            disabled={saving || countdown !== null}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 
                     text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Warning */}
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            <strong>Note:</strong> Changing username or password will log you out immediately. 
            You'll need to log back in with the new credentials.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DashboardConfigTab;
