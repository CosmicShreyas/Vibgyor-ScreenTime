import React, { useState, useEffect } from 'react';
import { Settings, Monitor, Server, Layout, Mail, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRestrictedMode } from '../contexts/RestrictedModeContext';
import ConfigurationTab from '../components/settings/ConfigurationTab';
import ServerConfigTab from '../components/settings/ServerConfigTab';
import DashboardConfigTab from '../components/settings/DashboardConfigTab';
import ReportsTab from '../components/settings/ReportsTab';
import ConnectedClientsTab from '../components/settings/ConnectedClientsTab';
import OTPModal from '../components/OTPModal';

type TabType = 'client' | 'server' | 'dashboard' | 'reports' | 'connected-clients';

const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('client');
  const { isRestricted, refreshRestrictedMode } = useRestrictedMode();
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [hasCheckedRestriction, setHasCheckedRestriction] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Only show OTP modal once when component mounts if restricted
    if (isRestricted && !hasCheckedRestriction) {
      setShowOTPModal(true);
      setHasCheckedRestriction(true);
    }
  }, [isRestricted, hasCheckedRestriction]);

  const handleOTPSuccess = async () => {
    await refreshRestrictedMode();
    setShowOTPModal(false);
  };

  const handleOTPClose = () => {
    setShowOTPModal(false);
    navigate('/dashboard');
  };

  const tabs = [
    { id: 'client' as TabType, label: 'Client Configuration', icon: Monitor },
    { id: 'server' as TabType, label: 'Server Configuration', icon: Server },
    { id: 'dashboard' as TabType, label: 'Dashboard Configuration', icon: Layout },
    { id: 'reports' as TabType, label: 'Reports', icon: Mail },
    { id: 'connected-clients' as TabType, label: 'Connected Clients', icon: Users },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Manage system configuration and preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                  transition-colors duration-200
                  ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        {activeTab === 'client' && <ConfigurationTab />}
        {activeTab === 'server' && <ServerConfigTab />}
        {activeTab === 'dashboard' && <DashboardConfigTab />}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === 'connected-clients' && <ConnectedClientsTab />}
      </div>

      {/* OTP Modal */}
      <OTPModal
        isOpen={showOTPModal}
        onClose={handleOTPClose}
        onSuccess={handleOTPSuccess}
      />
    </div>
  );
};

export default SettingsPage;
