import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Image, FileSpreadsheet, Upload, Settings, Moon, Sun, LogOut, Lock } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useRestrictedMode } from '../contexts/RestrictedModeContext'
import { useState } from 'react'
import OTPModal from './OTPModal'

export default function Sidebar() {
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
    { to: '/screenshots', icon: Image, label: 'Screenshots' },
    { to: '/timesheets', icon: FileSpreadsheet, label: 'Timesheets' },
    { to: '/ota-files', icon: Upload, label: 'OTA Files' },
  ]

  // Only show settings if not restricted
  if (!isRestricted) {
    navItems.push({ to: '/settings', icon: Settings, label: 'Settings' })
  }

  return (
    <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col card-shadow-lg">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Screentime
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Employee Monitoring</p>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-black shadow-md'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-sm'
              }`
            }
          >
            <item.icon size={20} />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}

        {/* Restricted Settings Button */}
        {isRestricted && (
          <button
            onClick={handleSettingsClick}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 dark:text-gray-200 
                     hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-sm transition-all duration-200"
          >
            <Lock size={20} className="text-red-600 dark:text-red-400" />
            <span className="font-medium">Settings (Locked)</span>
          </button>
        )}
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 hover:shadow-sm"
        >
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          <span className="font-medium">
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </span>
        </button>

        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 hover:shadow-sm border border-transparent hover:border-red-200 dark:hover:border-red-800"
        >
          <LogOut size={20} />
          <span className="font-medium">Logout</span>
        </button>
      </div>

      {/* OTP Modal */}
      <OTPModal
        isOpen={showOTPModal}
        onClose={() => setShowOTPModal(false)}
        onSuccess={handleOTPSuccess}
      />
    </div>
  )
}
