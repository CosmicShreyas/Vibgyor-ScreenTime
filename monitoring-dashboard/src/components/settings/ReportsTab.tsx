import React, { useState, useEffect } from 'react';
import { Mail, Send, Plus, Trash2, RefreshCw, CheckCircle, AlertCircle, Eye, EyeOff, TestTube, Edit2, Clock } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import ConfirmationModal from '../ConfirmationModal';

interface ReportsConfig {
  enabled: boolean;
  recipients: string[];
  schedule: 'weekly' | 'monthly';
  dayOfWeek: number;
  timeOfDay: string;
}

interface SMTPConfig {
  configured: boolean;
  email: string;
  hasPassword: boolean;
}

interface EODReportConfig {
  _id: string;
  clientId: string;
  employeeName: string;
  email: string;
  enabled: boolean;
}

interface ConnectedClient {
  clientId: string;
  employeeName: string;
  lastSeen: string;
}

const ReportsTab: React.FC = () => {
  const [config, setConfig] = useState<ReportsConfig | null>(null);
  const [smtpConfig, setSmtpConfig] = useState<SMTPConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [smtpEmail, setSmtpEmail] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [showSmtpEmail, setShowSmtpEmail] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);

  // EOD Reports state
  const [eodConfigs, setEodConfigs] = useState<EODReportConfig[]>([]);
  const [connectedClients, setConnectedClients] = useState<ConnectedClient[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [eodEmail, setEodEmail] = useState('');
  const [editingEodId, setEditingEodId] = useState<string | null>(null);
  const [editingEodEmail, setEditingEodEmail] = useState('');
  const [sendingEodTest, setSendingEodTest] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    id: string;
    employeeName: string;
  }>({ isOpen: false, id: '', employeeName: '' });

  useEffect(() => {
    fetchConfig();
    fetchSMTPConfig();
    fetchEODConfigs();
    fetchConnectedClients();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await api.get('/reports/config');
      setConfig(response.data);
    } catch (error) {
      console.error('Error fetching reports config:', error);
      toast.error('Failed to fetch reports configuration');
    } finally {
      setLoading(false);
    }
  };

  const fetchSMTPConfig = async () => {
    try {
      const response = await api.get('/reports/smtp-config');
      setSmtpConfig(response.data);
      setSmtpEmail(response.data.email || '');
      // Don't set password - let user enter new one if they want to change it
      setSmtpPassword('');
    } catch (error) {
      console.error('Error fetching SMTP config:', error);
    }
  };

  const fetchEODConfigs = async () => {
    try {
      const response = await api.get('/eod-reports');
      setEodConfigs(response.data);
    } catch (error) {
      console.error('Error fetching EOD configs:', error);
      toast.error('Failed to fetch EOD report configurations');
    }
  };

  const fetchConnectedClients = async () => {
    try {
      const response = await api.get('/connected-clients');
      // The API returns { success: true, clients: [...] }
      if (response.data && Array.isArray(response.data.clients)) {
        setConnectedClients(response.data.clients);
      } else if (Array.isArray(response.data)) {
        // Fallback if API returns array directly
        setConnectedClients(response.data);
      } else {
        console.error('Connected clients response is not in expected format:', response.data);
        setConnectedClients([]);
      }
    } catch (error) {
      console.error('Error fetching connected clients:', error);
      setConnectedClients([]); // Set to empty array on error
    }
  };

  const handleSaveSMTP = async () => {
    if (!smtpEmail) {
      toast.error('Please enter email address');
      return;
    }

    // If no existing password and no new password provided
    if (!smtpPassword && !smtpConfig?.hasPassword) {
      toast.error('Please enter app password');
      return;
    }

    setSaving(true);
    try {
      const payload: any = { email: smtpEmail };
      
      // Only send password if user entered a new one
      if (smtpPassword) {
        payload.appPassword = smtpPassword;
      }

      await api.put('/reports/smtp-config', payload);
      
      if (smtpPassword) {
        toast.success('SMTP configuration saved successfully!');
      } else {
        toast.success('SMTP email updated successfully!');
      }
      
      setSmtpPassword(''); // Clear password field after saving
      setShowSmtpPassword(false);
      fetchSMTPConfig();
    } catch (error: any) {
      console.error('Error saving SMTP config:', error);
      toast.error(error.response?.data?.error || 'Failed to save SMTP configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRecipient = async () => {
    if (!newEmail) {
      toast.error('Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      const response = await api.post('/reports/recipients', { email: newEmail });
      setConfig(response.data.config);
      setNewEmail('');
      toast.success('Recipient added successfully!');
    } catch (error: any) {
      console.error('Error adding recipient:', error);
      toast.error(error.response?.data?.error || 'Failed to add recipient');
    }
  };

  const handleRemoveRecipient = async (email: string) => {
    try {
      const response = await api.delete(`/reports/recipients/${encodeURIComponent(email)}`);
      setConfig(response.data.config);
      toast.success('Recipient removed successfully!');
    } catch (error: any) {
      console.error('Error removing recipient:', error);
      toast.error(error.response?.data?.error || 'Failed to remove recipient');
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    if (!config) return;

    try {
      const response = await api.put('/reports/config', { ...config, enabled });
      setConfig(response.data.config);
      toast.success(enabled ? 'Reports enabled!' : 'Reports disabled');
    } catch (error: any) {
      console.error('Error toggling reports:', error);
      toast.error(error.response?.data?.error || 'Failed to update reports status');
    }
  };

  const handleSendTestEmail = async () => {
    if (!newEmail) {
      toast.error('Please enter an email address to send test email');
      return;
    }

    setSendingTest(true);
    try {
      await api.post('/reports/test-email', { email: newEmail });
      toast.success(`Test email sent to ${newEmail}!`);
    } catch (error: any) {
      console.error('Error sending test email:', error);
      toast.error(error.response?.data?.error || 'Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  const handleSendReportNow = async () => {
    if (!config || config.recipients.length === 0) {
      toast.error('Please add at least one recipient');
      return;
    }

    setSendingReport(true);
    try {
      await api.post('/reports/send-now');
      toast.success('Weekly report sent successfully!');
    } catch (error: any) {
      console.error('Error sending report:', error);
      toast.error(error.response?.data?.error || 'Failed to send report');
    } finally {
      setSendingReport(false);
    }
  };

  // EOD Reports handlers
  const handleAddEODConfig = async () => {
    if (!selectedClientId) {
      toast.error('Please select a client');
      return;
    }

    if (!eodEmail) {
      toast.error('Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(eodEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      const client = connectedClients.find(c => c.clientId === selectedClientId);
      if (!client) {
        toast.error('Client not found');
        return;
      }

      await api.post('/eod-reports', {
        clientId: selectedClientId,
        employeeName: client.employeeName,
        email: eodEmail,
      });

      toast.success('EOD report configuration added successfully!');
      setSelectedClientId('');
      setEodEmail('');
      fetchEODConfigs();
    } catch (error: any) {
      console.error('Error adding EOD config:', error);
      toast.error(error.response?.data?.error || 'Failed to add EOD report configuration');
    }
  };

  const handleUpdateEODConfig = async (id: string) => {
    if (!editingEodEmail) {
      toast.error('Please enter an email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editingEodEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      await api.put(`/eod-reports/${id}`, { email: editingEodEmail });
      toast.success('EOD report configuration updated successfully!');
      setEditingEodId(null);
      setEditingEodEmail('');
      fetchEODConfigs();
    } catch (error: any) {
      console.error('Error updating EOD config:', error);
      toast.error(error.response?.data?.error || 'Failed to update EOD report configuration');
    }
  };

  const handleToggleEODEnabled = async (id: string, enabled: boolean) => {
    try {
      await api.put(`/eod-reports/${id}`, { enabled });
      toast.success(enabled ? 'EOD report enabled!' : 'EOD report disabled');
      fetchEODConfigs();
    } catch (error: any) {
      console.error('Error toggling EOD config:', error);
      toast.error(error.response?.data?.error || 'Failed to update EOD report status');
    }
  };

  const handleDeleteEODConfig = async (id: string) => {
    try {
      await api.delete(`/eod-reports/${id}`);
      toast.success('EOD report configuration deleted successfully!');
      fetchEODConfigs();
    } catch (error: any) {
      console.error('Error deleting EOD config:', error);
      toast.error(error.response?.data?.error || 'Failed to delete EOD report configuration');
    }
  };

  const handleSendEODTestNow = async (config: EODReportConfig) => {
    setSendingEodTest(config._id);
    try {
      await api.post('/eod-reports/send-now', {
        clientId: config.clientId,
        employeeName: config.employeeName,
        email: config.email,
      });
      toast.success(`EOD report sent to ${config.email}!`);
    } catch (error: any) {
      console.error('Error sending EOD report:', error);
      toast.error(error.response?.data?.error || 'Failed to send EOD report');
    } finally {
      setSendingEodTest(null);
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
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Weekly Reports & Notifications
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Configure automated weekly productivity reports sent via email
        </p>
      </div>

      {/* SMTP Configuration */}
      <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          Gmail SMTP Configuration
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Configure Gmail SMTP to send automated reports. You'll need to generate an App Password from your Google Account settings.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Gmail Address
            </label>
            <div className="relative">
              <input
                type={showSmtpEmail ? 'text' : 'password'}
                value={smtpEmail}
                onChange={(e) => setSmtpEmail(e.target.value)}
                placeholder="your-email@gmail.com"
                className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowSmtpEmail(!showSmtpEmail)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showSmtpEmail ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Gmail App Password
              {smtpConfig?.hasPassword && (
                <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                  (Configured ✓)
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type={showSmtpPassword ? 'text' : 'password'}
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={smtpConfig?.hasPassword ? "Leave empty to keep existing password, use quotes to cover the app password before saving" : "Enter 16-character app password"}
                className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showSmtpPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Generate an App Password at: <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">myaccount.google.com/apppasswords</a>
            </p>
            {smtpConfig?.hasPassword && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Password is already configured. Enter a new one only if you want to change it.
              </p>
            )}
          </div>

          <button
            onClick={handleSaveSMTP}
            disabled={saving || !smtpEmail}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Save SMTP Configuration
              </>
            )}
          </button>
        </div>
      </div>

      {/* Report Recipients */}
      <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Send className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          Report Recipients
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Add up to 5 email addresses to receive weekly productivity reports
        </p>

        {/* Add Recipient */}
        <div className="flex gap-2 mb-4">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddRecipient()}
            placeholder="Enter email address"
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <button
            onClick={handleAddRecipient}
            disabled={!newEmail || (config?.recipients.length || 0) >= 5}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
          <button
            onClick={handleSendTestEmail}
            disabled={sendingTest || !newEmail || !smtpConfig?.configured}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Send test email to verify configuration"
          >
            {sendingTest ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <TestTube className="w-4 h-4" />
            )}
            Test
          </button>
        </div>

        {/* Recipients List */}
        {config && config.recipients.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Recipients ({config.recipients.length}/5):
            </p>
            {config.recipients.map((email) => (
              <div
                key={email}
                className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600"
              >
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-900 dark:text-white">{email}</span>
                </div>
                <button
                  onClick={() => handleRemoveRecipient(email)}
                  className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Mail className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No recipients added yet</p>
          </div>
        )}
      </div>

      {/* Report Settings */}
      {config && (
        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Report Settings
          </h3>

          <div className="space-y-4">
            {/* Enable/Disable Reports */}
            <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">Enable Weekly Reports</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Automatically send reports every Monday at 9:00 AM
                </p>
              </div>
              <button
                onClick={() => handleToggleEnabled(!config.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Send Report Now */}
            <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">Send Report Now</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Send a weekly report immediately to all recipients
                </p>
              </div>
              <button
                onClick={handleSendReportNow}
                disabled={sendingReport || config.recipients.length === 0 || !smtpConfig?.configured}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendingReport ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-medium mb-1">About Weekly Reports</p>
            <p>
              Reports include productivity insights, top performers, idle time analysis, and application usage statistics for all employees. 
              Reports are automatically generated from the past 7 days of activity data.
            </p>
          </div>
        </div>
      </div>

      {/* EOD Reports Section */}
      <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Daily EOD Reports
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Configure automated End-of-Day reports sent to individual employees with their daily progress
          </p>
        </div>

        {/* Add EOD Report */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Add Employee EOD Report
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Employee (Client)
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="">-- Select a client --</option>
                {Array.isArray(connectedClients) && connectedClients.map((client) => (
                  <option key={client.clientId} value={client.clientId}>
                    {client.employeeName || 'Unknown'} ({client.clientId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Employee Email Address
              </label>
              <input
                type="email"
                value={eodEmail}
                onChange={(e) => setEodEmail(e.target.value)}
                placeholder="employee@company.com"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <button
              onClick={handleAddEODConfig}
              disabled={!selectedClientId || !eodEmail || !smtpConfig?.configured}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Add EOD Report
            </button>
          </div>
        </div>

        {/* EOD Reports List */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Configured EOD Reports ({eodConfigs.length})
          </h3>

          {eodConfigs.length > 0 ? (
            <div className="space-y-3">
              {eodConfigs.map((eodConfig) => (
                <div
                  key={eodConfig._id}
                  className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {eodConfig.employeeName}
                      </span>
                      <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                        {eodConfig.clientId}
                      </span>
                    </div>
                    
                    {editingEodId === eodConfig._id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="email"
                          value={editingEodEmail}
                          onChange={(e) => setEditingEodEmail(e.target.value)}
                          className="flex-1 px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                        <button
                          onClick={() => handleUpdateEODConfig(eodConfig._id)}
                          className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700 text-white rounded"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingEodId(null);
                            setEditingEodEmail('');
                          }}
                          className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {eodConfig.email}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Enable/Disable Toggle */}
                    <button
                      onClick={() => handleToggleEODEnabled(eodConfig._id, !eodConfig.enabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        eodConfig.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                      title={eodConfig.enabled ? 'Enabled' : 'Disabled'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          eodConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>

                    {/* Edit Button */}
                    {editingEodId !== eodConfig._id && (
                      <button
                        onClick={() => {
                          setEditingEodId(eodConfig._id);
                          setEditingEodEmail(eodConfig.email);
                        }}
                        className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                        title="Edit email"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}

                    {/* Send Test Button */}
                    <button
                      onClick={() => handleSendEODTestNow(eodConfig)}
                      disabled={sendingEodTest === eodConfig._id || !smtpConfig?.configured}
                      className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Send test report now"
                    >
                      {sendingEodTest === eodConfig._id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => setDeleteConfirmation({
                        isOpen: true,
                        id: eodConfig._id,
                        employeeName: eodConfig.employeeName,
                      })}
                      className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Mail className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No EOD reports configured yet</p>
              <p className="text-sm mt-1">Add employees above to start sending daily reports</p>
            </div>
          )}
        </div>

        {/* EOD Info Banner */}
        <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-purple-800 dark:text-purple-200">
              <p className="font-medium mb-1">About Daily EOD Reports</p>
              <p>
                EOD (End-of-Day) reports are automatically sent to each configured employee at the time specified in Server Configuration. 
                Reports include their work time, idle time, offline time, productivity score, top applications, and most visited websites for that day.
                Configure the report time in the Server Configuration tab.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        onClose={() => setDeleteConfirmation({ isOpen: false, id: '', employeeName: '' })}
        onConfirm={() => handleDeleteEODConfig(deleteConfirmation.id)}
        title="Delete EOD Report Configuration"
        message={`Are you sure you want to delete the EOD report configuration for ${deleteConfirmation.employeeName}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
};

export default ReportsTab;
