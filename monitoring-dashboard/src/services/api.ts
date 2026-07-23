import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Employee self-view requests must never inherit the admin JWT or its global
// 401 -> /login redirect. The server exposes a deliberately narrow public
// surface for this page.
const publicApi = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Types
export interface EmployeeSummary {
  name: string
  work_time_today: number
  idle_time_today: number
  last_update: string
  status: 'active' | 'idle' | 'paused' | 'offline'
  monitoring_paused?: boolean
  paused_at?: string
  location?: {
    city: string
    state: string
    country: string
  }
}

export interface ConnectedClient {
  clientId: string
  employeeName: string | null
  employeeId: string | null
  firstSeen: string
  lastSeen: string
}

export type ActivityCategory = 'productive' | 'neutral' | 'unproductive'

export interface Application {
  name: string
  duration: number
  active: boolean
  category?: ActivityCategory
}

export interface ProductivitySummary {
  score: number
  work_seconds: number
  idle_seconds: number
  category_seconds: {
    productive: number
    neutral: number
    unproductive: number
  }
}

export interface WebsiteUsageInfo {
  domain: string
  duration: number
  visits: number
  category: ActivityCategory
}

export interface BrowserTab {
  title: string
  url: string
  duration: number
  browser: string
}

export interface ActivityHistoryItem {
  timestamp: string
  work_seconds: number
  idle_seconds: number
}

export interface Screenshot {
  id: string
  employee_id?: string
  employee_name?: string
  thumbnail_url: string
  full_url: string
  captured_at: string
  file_size?: number
}

export interface EmployeeDetail {
  name: string
  monitoring_paused?: boolean
  paused_at?: string
  current_applications: Application[]
  current_browser_tabs: BrowserTab[]
  activity_history: ActivityHistoryItem[]
  recent_screenshots: Screenshot[]
  location?: {
    city: string
    state: string
    country: string
  }
  productivity?: ProductivitySummary
  website_usage?: WebsiteUsageInfo[]
  integrity?: IntegritySummary
}

export interface IntegritySummary {
  keystrokes: number
  mouse_clicks: number
  mouse_distance_px: number
  scroll_events: number
  keystrokes_per_min: number
  mouse_activity_per_min: number
  suspected_fake_seconds: number
  genuineness_score: number
  suspicion_reasons: string[]
}

export interface ApplicationUsage {
  employee_name: string
  period: string
  start_date: string
  end_date: string
  total_duration: number
  applications: Array<{
    name: string
    duration: number
    percentage: number
  }>
}

export interface BrowserTabUsage {
  employee_name: string
  period: string
  start_date: string
  end_date: string
  total_duration: number
  browser_tabs: Array<{
    browser?: string
    title: string
    url: string
    duration: number
    percentage: number
  }>
}

export interface TimelineSegment {
  start: string
  end: string
  type: 'work' | 'idle' | 'offline'
}

export interface EmployeeTimeline {
  name: string
  date?: string
  status: 'active' | 'idle' | 'paused' | 'offline'
  work_time_today: number
  idle_time_today: number
  segments: TimelineSegment[]
}

export interface TimelineResponse {
  employees: EmployeeTimeline[]
  shiftStartHour: number
  shiftEndHour: number
}

// Analytics / Attendance / Alerts
export interface TeamOverview {
  date: string
  start_date?: string
  end_date?: string
  total_work_seconds?: number
  total_idle_seconds?: number
  total_employees: number
  present_count: number
  average_productivity: number
  top_performer: { employee_name: string; productivity_score: number; work_seconds: number; idle_seconds: number } | null
  needs_attention: { employee_name: string; productivity_score: number; work_seconds: number; idle_seconds: number } | null
  employees: Array<{ employee_name: string; present: boolean; productivity_score: number; work_seconds: number; idle_seconds: number }>
  days?: Array<{ date: string; present_count: number; work_seconds: number; idle_seconds: number }>
}

export interface ProductivityTrendPoint {
  date: string
  productivity_score: number
  work_seconds: number
  idle_seconds: number
  productive_seconds: number
  unproductive_seconds: number
}

export interface AttendanceDay {
  date: string
  present: boolean
  first_activity: string | null
  last_activity: string | null
  work_seconds: number
  idle_seconds: number
  late: boolean
  early_departure: boolean
  hours_worked: number
}

export interface AttendanceSummary {
  employee_name: string
  shift_start_hour: number
  shift_end_hour: number
  days_present: number
  days_absent: number
  late_count: number
  early_departure_count: number
  avg_hours_worked: number
  days: AttendanceDay[]
}

export interface Alert {
  id: string
  employee_name: string
  type: 'high_idle' | 'low_productivity' | 'offline_during_shift' | 'unproductive_overuse' | 'suspected_fake_activity' | 'idle_explanation' | 'monitoring_recovery'
  severity: 'info' | 'warning' | 'critical'
  message: string
  value: number
  threshold: number
  created_at: string
  idle_reasons?: string[]
}

export interface AlertsConfig {
  enabled: boolean
  highIdleMinutes: number
  lowProductivityScore: number
  offlineDuringShiftMinutes: number
  unproductiveSiteMinutes: number
  suspectedFakeMinutes: number
  emailAdminsOnAlert: boolean
}

// Auth Service
export const authService = {
  login: async (username: string, password: string) => {
    const response = await api.post('/auth/login', { username, password })
    return response.data
  },
}

// Sentinel employee value meaning "aggregate across all employees". Kept in
// sync with the server's ALL_EMPLOYEES_SENTINEL.
export const ALL_EMPLOYEES = '__all__'

// Employee Service
export const employeeService = {
  getAll: async (): Promise<EmployeeSummary[]> => {
    const response = await api.get('/employees')
    return response.data
  },

  getDetail: async (name: string, startDate?: string, endDate?: string): Promise<EmployeeDetail> => {
    const params: any = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    
    const response = await api.get(`/employees/${encodeURIComponent(name)}`, { params })
    return response.data
  },

  getApplicationUsage: async (name: string, period: string = 'today', startDate?: string, endDate?: string): Promise<ApplicationUsage> => {
    const params: any = { period };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    
    const response = await api.get(`/employees/${encodeURIComponent(name)}/app-usage`, { params })
    return response.data
  },

  getBrowserTabUsage: async (name: string, period: string = 'today', startDate?: string, endDate?: string): Promise<BrowserTabUsage> => {
    const params: any = { period };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    
    const response = await api.get(`/employees/${encodeURIComponent(name)}/browser-tab-usage`, { params })
    return response.data
  },

  getTimeline: async (date?: string, endDate?: string): Promise<TimelineResponse> => {
    const response = await api.get('/employees/timeline/all', {
      params: date ? (endDate ? { startDate: date, endDate } : { date }) : {}
    })
    return response.data
  },

  getEmployeeWeeklyTimeline: async (name: string): Promise<any> => {
    const response = await api.get(`/employees/${encodeURIComponent(name)}/weekly-timeline`)
    return response.data
  },

  getMonthlyTimesheet: async (
    year: number,
    month: number
  ): Promise<any[]> => {
    const params = new URLSearchParams({
      year: year.toString(),
      month: month.toString(),
    })
    
    const response = await api.get(`/employees/timesheet/monthly?${params.toString()}`)
    return response.data
  },
}

// Public, employee-only API used by /self-view. Keeping this separate from
// employeeService prevents an unauthenticated employee page from ever being
// mistaken for an expired administrator session.
export const selfViewService = {
  getDetail: async (name: string, startDate?: string, endDate?: string): Promise<EmployeeDetail> => {
    const response = await publicApi.get(`/employees/${encodeURIComponent(name)}`, { params: { startDate, endDate } })
    return response.data
  },
  getApplicationUsage: async (name: string, startDate?: string, endDate?: string): Promise<ApplicationUsage> => {
    const response = await publicApi.get(`/employees/${encodeURIComponent(name)}/app-usage`, { params: { period: 'today', startDate, endDate } })
    return response.data
  },
  getBrowserTabUsage: async (name: string, startDate?: string, endDate?: string): Promise<BrowserTabUsage> => {
    const response = await publicApi.get(`/employees/${encodeURIComponent(name)}/browser-tab-usage`, { params: { period: 'today', startDate, endDate } })
    return response.data
  },
  getWeeklyTimeline: async (name: string): Promise<any> => {
    const response = await publicApi.get(`/employees/${encodeURIComponent(name)}/weekly-timeline`)
    return response.data
  },
  getFocusMetrics: async (name: string, days: number, endDate?: string): Promise<any> => {
    const response = await publicApi.get(`/analytics/public/wellbeing/focus/${encodeURIComponent(name)}`, { params: { days, endDate } })
    return response.data
  },
}

// Screenshot Service
export const screenshotService = {
  getScreenshotUrl: (id: string): string => {
    const token = localStorage.getItem('auth_token')
    return `/api/screenshots/${id}?token=${token}`
  },
  
  getScreenshotsWithFilters: async (
    startDate: string,
    endDate: string,
    employeeName?: string
  ): Promise<Screenshot[]> => {
    const params = new URLSearchParams({
      startDate,
      endDate,
    })
    
    if (employeeName) {
      params.append('employeeName', employeeName)
    }
    
    const response = await api.get(`/screenshots/list?${params.toString()}`)
    return response.data
  },
}

// Analytics Service
export const analyticsService = {
  getOverview: async (startDate?: string, endDate?: string, employee?: string): Promise<TeamOverview> => {
    const params: any = {}
    if (startDate) {
      params.startDate = startDate
      params.endDate = endDate || startDate
    }
    if (employee) params.employee = employee
    const response = await api.get('/analytics/overview', { params })
    return response.data
  },

  getTrend: async (days: number = 7, employee?: string, endDate?: string): Promise<ProductivityTrendPoint[]> => {
    const params: any = { days }
    if (employee) params.employee = employee
    if (endDate) params.endDate = endDate
    const response = await api.get('/analytics/trend', { params })
    return response.data
  },

  getFocus: async (name: string, date?: string): Promise<any> => {
    const response = await api.get(`/analytics/focus/${encodeURIComponent(name)}`, { params: date ? { date } : {} })
    return response.data
  },

  getInsights: async (date?: string, endDate?: string, employee?: string): Promise<{ insights: string[] }> => {
    const params: any = {}
    if (date) params.date = date
    if (endDate) params.endDate = endDate
    if (employee) params.employee = employee
    const response = await api.get('/analytics/insights', { params })
    return response.data
  },

  getAttendance: async (name: string, startDate?: string, endDate?: string): Promise<AttendanceSummary> => {
    const params: any = {}
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate
    const response = await api.get(`/analytics/attendance/${encodeURIComponent(name)}`, { params })
    return response.data
  },

  getAlerts: async (date?: string, endDate?: string, employee?: string): Promise<{ alerts: Alert[] }> => {
    const params: any = {}
    if (date) params.date = date
    if (endDate) params.endDate = endDate
    if (employee) params.employee = employee
    const response = await api.get('/analytics/alerts', { params })
    return response.data
  },

  dismissAlert: async (id: string): Promise<void> => {
    await api.post(`/analytics/alerts/${encodeURIComponent(id)}/dismiss`)
  },

  getAlertsConfig: async (): Promise<AlertsConfig> => {
    const response = await api.get('/analytics/alerts/config')
    return response.data
  },

  updateAlertsConfig: async (cfg: Partial<AlertsConfig>): Promise<AlertsConfig> => {
    const response = await api.put('/analytics/alerts/config', cfg)
    return response.data
  },

  // --- Wellbeing / advanced insights ---
  getFocusMetrics: async (name: string, days = 7, endDate?: string): Promise<any> => {
    const params: any = { days }
    if (endDate) params.endDate = endDate
    const response = await api.get(`/analytics/wellbeing/focus/${encodeURIComponent(name)}`, { params })
    return response.data
  },
  getBurnout: async (days = 7, endDate?: string): Promise<any> => {
    const params: any = { days }
    if (endDate) params.endDate = endDate
    const response = await api.get('/analytics/wellbeing/burnout', { params })
    return response.data
  },
  getAnomalies: async (): Promise<any> => {
    const response = await api.get('/analytics/wellbeing/anomalies')
    return response.data
  },
  getTeamPulse: async (): Promise<any> => {
    const response = await api.get('/analytics/wellbeing/team-pulse')
    return response.data
  },
}

// Config Service
export const configService = {
  getClientConfig: async (employeeName: string) => {
    const response = await api.get(`/config/client/${encodeURIComponent(employeeName)}`)
    return response.data
  },

  updateClientConfig: async (employeeName: string, config: any) => {
    const response = await api.put(`/config/client/${encodeURIComponent(employeeName)}`, config)
    return response.data
  },

  getDefaults: async () => {
    const response = await api.get('/config/defaults')
    return response.data
  },
}

// Utility functions for employee self-view
export const employeeSelfViewUtils = {
  /**
   * Encode employee name to BASE64 for URL query parameter
   */
  encodeEmployeeName: (name: string): string => {
    try {
      return btoa(name)
    } catch (error) {
      console.error('Failed to encode employee name:', error)
      return ''
    }
  },

  /**
   * Decode BASE64 employee name from URL query parameter
   */
  decodeEmployeeName: (encoded: string): string => {
    try {
      return atob(encoded)
    } catch (error) {
      console.error('Failed to decode employee name:', error)
      return ''
    }
  },

  /**
   * Generate self-view URL for an employee
   */
  generateSelfViewUrl: (employeeName: string): string => {
    const encoded = btoa(employeeName)
    return `/self-view?usr=${encoded}`
  },
}

export default api
