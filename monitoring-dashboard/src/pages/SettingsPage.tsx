import React, { useState, useEffect } from 'react';
import { Monitor, Server, Layout, Mail, Users, SlidersHorizontal, BellRing } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useRestrictedMode } from '../contexts/RestrictedModeContext';
import ConfigurationTab from '../components/settings/ConfigurationTab';
import ServerConfigTab from '../components/settings/ServerConfigTab';
import DashboardConfigTab from '../components/settings/DashboardConfigTab';
import ReportsTab from '../components/settings/ReportsTab';
import ConnectedClientsTab from '../components/settings/ConnectedClientsTab';
import AlertsTab from '../components/settings/AlertsTab';
import OTPModal from '../components/OTPModal';
import { PageShell, MotionCard } from '../components/ui';
import { riseItem } from '../components/ui/motion';

type TabType = 'client' | 'server' | 'dashboard' | 'reports' | 'alerts' | 'connected-clients';

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
    { id: 'client' as TabType, label: 'Client', icon: Monitor },
    { id: 'server' as TabType, label: 'Server', icon: Server },
    { id: 'dashboard' as TabType, label: 'Dashboard', icon: Layout },
    { id: 'reports' as TabType, label: 'Reports', icon: Mail },
    { id: 'alerts' as TabType, label: 'Alerts', icon: BellRing },
    { id: 'connected-clients' as TabType, label: 'Connected Clients', icon: Users },
  ];

  return (
    <PageShell
      eyebrow="Administration"
      title="Control Panel"
      description="Manage monitoring policy, server connectivity, dashboard security, reports, and connected client state."
      icon={SlidersHorizontal}
    >
      {/* Tab bar with animated active indicator */}
      <MotionCard hover={false} className="p-2">
        <nav
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Settings sections"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)] ${
                  isActive
                    ? 'text-[var(--primary-foreground)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="settings-active-tab"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    className="absolute inset-0 rounded-xl bg-[var(--primary)] shadow-[0_14px_30px_-22px_var(--primary)]"
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </MotionCard>

      {/* Tab content */}
      <MotionCard hover={false} className="overflow-hidden p-5">
        <motion.div
          key={activeTab}
          variants={riseItem}
          initial="hidden"
          animate="show"
        >
          {activeTab === 'client' && <ConfigurationTab />}
          {activeTab === 'server' && <ServerConfigTab />}
          {activeTab === 'dashboard' && <DashboardConfigTab />}
          {activeTab === 'reports' && <ReportsTab />}
          {activeTab === 'alerts' && <AlertsTab />}
          {activeTab === 'connected-clients' && <ConnectedClientsTab />}
        </motion.div>
      </MotionCard>

      {/* OTP Modal */}
      <OTPModal
        isOpen={showOTPModal}
        onClose={handleOTPClose}
        onSuccess={handleOTPSuccess}
      />
    </PageShell>
  );
};

export default SettingsPage;
