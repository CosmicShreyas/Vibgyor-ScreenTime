import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Image, FileSpreadsheet, BarChart3, BellRing, Settings, Moon, Sun, LogOut, Lock } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useRestrictedMode } from '../contexts/RestrictedModeContext'
import { useState } from 'react'
import OTPModal from './OTPModal'

export default function Navbar() {
  const { theme, toggleTheme } = useTheme()
  const { logout } = useAuth()
  const { isRestricted, refreshRestrictedMode } = useRestrictedMode()
  const [showOTPModal, setShowOTPModal] = useState(false)

  const handleSettingsClick = (e: React.MouseEvent) => {
    if (isRestricted) {
      e.preventDefault()
      setShowOTPModal(true)
    }
  }

  const handleOTPSuccess = () => {
    refreshRestrictedMode()
  }

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/employees', icon: Users, label: 'Employees' },
    { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    { to: '/alerts', icon: BellRing, label: 'Alerts' },
    { to: '/screenshots', icon: Image, label: 'Screenshots' },
    { to: '/timesheets', icon: FileSpreadsheet, label: 'Timesheets' },
  ]

  return (
    <>
      {/* Floating Navbar Container */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-7xl">
        <nav className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-full shadow-2xl border border-gray-200/50 dark:border-gray-700/50 px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Logo/Brand */}
            <div className="flex items-center gap-3 px-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">S</span>
              </div>
              <div className="hidden md:block">
                <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-none">
                  ScreenTime
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">Employee Monitoring</p>
              </div>
            </div>

            {/* Navigation Items */}
            <div className="flex items-center gap-2 flex-1 justify-center">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 ${
                      isActive
                        ? 'bg-gray-900 dark:bg-white text-white dark:text-black shadow-lg scale-105'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 hover:scale-105'
                    }`
                  }
                  title={item.label}
                >
                  <item.icon size={18} />
                  <span className="font-medium text-sm hidden lg:inline">{item.label}</span>
                </NavLink>
              ))}

              {/* Settings Button */}
              {isRestricted ? (
                <button
                  onClick={handleSettingsClick}
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-gray-700 dark:text-gray-200 
                           hover:bg-gray-100 dark:hover:bg-gray-700 hover:scale-105 transition-all duration-200"
                  title="Settings (Locked)"
                >
                  <Lock size={18} className="text-red-600 dark:text-red-400" />
                  <span className="font-medium text-sm hidden lg:inline">Settings</span>
                </button>
              ) : (
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 ${
                      isActive
                        ? 'bg-gray-900 dark:bg-white text-white dark:text-black shadow-lg scale-105'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 hover:scale-105'
                    }`
                  }
                  title="Settings"
                >
                  <Settings size={18} />
                  <span className="font-medium text-sm hidden lg:inline">Settings</span>
                </NavLink>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center w-10 h-10 rounded-full text-gray-700 dark:text-gray-200 
                         hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 hover:scale-110"
                title={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>

              {/* Logout Button */}
              <button
                onClick={logout}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-red-600 dark:text-red-400 
                         hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 hover:scale-105
                         border border-transparent hover:border-red-200 dark:hover:border-red-800"
                title="Logout"
              >
                <LogOut size={18} />
                <span className="font-medium text-sm hidden md:inline">Logout</span>
              </button>
            </div>
          </div>
        </nav>
      </div>

      {/* Spacer to prevent content from going under navbar */}
      <div className="h-4"></div>

      {/* OTP Modal */}
      <OTPModal
        isOpen={showOTPModal}
        onClose={() => setShowOTPModal(false)}
        onSuccess={handleOTPSuccess}
      />
    </>
  )
}
