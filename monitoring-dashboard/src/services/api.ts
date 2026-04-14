import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
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
  status: 'active' | 'idle' | 'offline'
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

export interface Application {
  name: string
  duration: number
  active: boolean
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
  current_applications: Application[]
  current_browser_tabs: BrowserTab[]
  activity_history: ActivityHistoryItem[]
  recent_screenshots: Screenshot[]
  location?: {
    city: string
    state: string
    country: string
  }
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
  status: 'active' | 'idle' | 'offline'
  work_time_today: number
  idle_time_today: number
  segments: TimelineSegment[]
}

export interface TimelineResponse {
  employees: EmployeeTimeline[]
  shiftStartHour: number
  shiftEndHour: number
}

// Auth Service
export const authService = {
  login: async (username: string, password: string) => {
    const response = await api.post('/auth/login', { username, password })
    return response.data
  },
}

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
    
    console.log('API getDetail called with:', { name, startDate, endDate, params })
    const response = await api.get(`/employees/${encodeURIComponent(name)}`, { params })
    console.log('API getDetail response:', response.data)
    return response.data
  },

  getApplicationUsage: async (name: string, period: string = 'today', startDate?: string, endDate?: string): Promise<ApplicationUsage> => {
    const params: any = { period };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    
    console.log('API getApplicationUsage called with:', { name, period, startDate, endDate, params })
    const response = await api.get(`/employees/${encodeURIComponent(name)}/app-usage`, { params })
    console.log('API getApplicationUsage response:', response.data)
    return response.data
  },

  getBrowserTabUsage: async (name: string, period: string = 'today', startDate?: string, endDate?: string): Promise<BrowserTabUsage> => {
    const params: any = { period };
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    
    console.log('API getBrowserTabUsage called with:', { name, period, startDate, endDate, params })
    const response = await api.get(`/employees/${encodeURIComponent(name)}/browser-tab-usage`, { params })
    console.log('API getBrowserTabUsage response:', response.data)
    return response.data
  },

  getTimeline: async (date?: string): Promise<TimelineResponse> => {
    const response = await api.get('/employees/timeline/all', {
      params: date ? { date } : {}
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
