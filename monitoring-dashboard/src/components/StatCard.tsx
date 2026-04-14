import { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { formatTime } from '../utils/time'

export interface EmployeeInfo {
  name: string
  status: 'active' | 'idle' | 'offline'
  work_time_today: number
}

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  color: string
  employees?: EmployeeInfo[]
  showTooltip?: boolean
}

export default function StatCard({ title, value, icon: Icon, color, employees, showTooltip = false }: StatCardProps) {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)

  const colorClasses = {
    blue: 'bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    red: 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400',
  }

  return (
    <div 
      className="relative bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 card-shadow-lg hover:shadow-xl transition-all duration-200"
      onMouseEnter={() => showTooltip && employees && employees.length > 0 && setIsTooltipVisible(true)}
      onMouseLeave={() => setIsTooltipVisible(false)}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">{title}</p>
          <p className="text-3xl font-bold mt-2 text-gray-900 dark:text-white">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
          <Icon size={24} />
        </div>
      </div>

      {/* Scrollable Tooltip */}
      {showTooltip && employees && employees.length > 0 && isTooltipVisible && (
        <div 
          className="absolute left-0 top-full mt-2 w-80 bg-gray-800 dark:bg-gray-950 rounded-lg shadow-2xl border border-gray-700 dark:border-gray-600 z-50 overflow-hidden"
          onMouseEnter={() => setIsTooltipVisible(true)}
          onMouseLeave={() => setIsTooltipVisible(false)}
        >
          <div className="p-3 border-b border-gray-700 dark:border-gray-600 bg-gray-900 dark:bg-black">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
          </div>
          <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
            {employees.map((employee, index) => (
              <div 
                key={`${employee.name}-${index}`}
                className="p-3 hover:bg-gray-700 dark:hover:bg-gray-900 transition-colors border-b border-gray-700/50 dark:border-gray-800/50 last:border-b-0"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gray-700 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-semibold">
                        {employee.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white text-sm truncate">
                        {employee.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatTime(employee.work_time_today)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    <div className={`w-2 h-2 rounded-full ${
                      employee.status === 'active' 
                        ? 'bg-green-500 animate-pulse' 
                        : employee.status === 'idle'
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                    }`}></div>
                    <span className="text-xs text-gray-300 capitalize">
                      {employee.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
