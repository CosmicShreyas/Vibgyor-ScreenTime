import { LucideIcon } from 'lucide-react'
import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  eyebrow?: string
  description?: string
  icon?: LucideIcon
  actions?: ReactNode
  metric?: {
    label: string
    value: string | number
  }
}

export default function PageHeader({ title, eyebrow, description, icon: Icon, actions, metric }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon && (
          <div className="page-header-icon">
            <Icon size={20} strokeWidth={2.2} />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
          <h1 className="page-title">{title}</h1>
          {description && <p className="page-description">{description}</p>}
        </div>
      </div>
      {(metric || actions) && (
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {metric && (
            <div className="page-metric">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          )}
          {actions}
        </div>
      )}
    </header>
  )
}
