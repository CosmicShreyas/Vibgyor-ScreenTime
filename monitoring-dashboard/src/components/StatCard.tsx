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
    blue: 'bg-[color-mix(in_oklab,var(--running)_14%,transparent)] text-[var(--running)]',
    green: 'bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-[var(--success)]',
    red: 'bg-red-500/10 text-red-600 dark:text-red-400',
    yellow: 'bg-[color-mix(in_oklab,var(--warning)_18%,transparent)] text-[color-mix(in_oklab,var(--warning)_78%,var(--foreground))]',
  }

  return (
    <div 
      className="dashboard-card relative overflow-visible p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_oklab,var(--primary)_40%,var(--border))] hover:shadow-[var(--shadow-md)]"
      onMouseEnter={() => showTooltip && employees && employees.length > 0 && setIsTooltipVisible(true)}
      onMouseLeave={() => setIsTooltipVisible(false)}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-[var(--muted-foreground)]">{title}</p>
          <p className="mt-1.5 font-display text-2xl font-bold text-[var(--foreground)]">{value}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${colorClasses[color as keyof typeof colorClasses]}`}>
          <Icon size={20} />
        </div>
      </div>

      {/* Scrollable Tooltip */}
      {showTooltip && employees && employees.length > 0 && isTooltipVisible && (
        <div 
          className="absolute left-0 top-full z-50 mt-3 w-80 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--primary)] shadow-2xl"
          onMouseEnter={() => setIsTooltipVisible(true)}
          onMouseLeave={() => setIsTooltipVisible(false)}
        >
          <div className="border-b border-white/10 bg-black/10 p-3">
            <h3 className="text-sm font-semibold text-[var(--primary-foreground)]">{title}</h3>
          </div>
          <div className="custom-scrollbar max-h-64 overflow-y-auto">
            {employees.map((employee, index) => (
              <div 
                key={`${employee.name}-${index}`}
                className="border-b border-white/10 p-3 transition-colors last:border-b-0 hover:bg-white/10"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10">
                      <span className="text-xs font-semibold text-[var(--primary-foreground)]">
                        {employee.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--primary-foreground)]">
                        {employee.name}
                      </p>
                      <p className="text-xs text-[color-mix(in_oklab,var(--primary-foreground)_72%,transparent)]">
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
                    <span className="text-xs capitalize text-[color-mix(in_oklab,var(--primary-foreground)_82%,transparent)]">
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
