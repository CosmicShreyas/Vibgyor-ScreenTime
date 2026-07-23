import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { RestrictedModeProvider } from './contexts/RestrictedModeContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import DashboardLayout from './layouts/DashboardLayout'
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const EmployeesPage = lazy(() => import('./pages/EmployeesPage'))
const EmployeeDetailPage = lazy(() => import('./pages/EmployeeDetailPage'))
const EmployeeSelfViewPage = lazy(() => import('./pages/EmployeeSelfViewPage'))
const ScreenshotsPage = lazy(() => import('./pages/ScreenshotsPage'))
const TimesheetsPage = lazy(() => import('./pages/TimesheetsPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const AlertsPage = lazy(() => import('./pages/AlertsPage'))
const WellbeingPage = lazy(() => import('./pages/WellbeingPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

const RouteFallback = () => (
  <div className="flex min-h-[45vh] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]" aria-label="Loading page" />
  </div>
)

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RestrictedModeProvider>
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/self-view" element={<EmployeeSelfViewPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="employees" element={<EmployeesPage />} />
                <Route path="employees/:name" element={<EmployeeDetailPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="wellbeing" element={<WellbeingPage />} />
                <Route path="alerts" element={<AlertsPage />} />
                <Route path="attendance" element={<Navigate to="/alerts" replace />} />
                <Route path="screenshots" element={<ScreenshotsPage />} />
                <Route path="timesheets" element={<TimesheetsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: 'var(--toast-bg)',
                color: 'var(--toast-color)',
              },
            }}
          />
        </RestrictedModeProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
