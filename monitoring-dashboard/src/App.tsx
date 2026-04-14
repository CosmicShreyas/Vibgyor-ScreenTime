import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { RestrictedModeProvider } from './contexts/RestrictedModeContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import DashboardLayout from './layouts/DashboardLayout'
import DashboardPage from './pages/DashboardPage'
import EmployeesPage from './pages/EmployeesPage'
import EmployeeDetailPage from './pages/EmployeeDetailPage'
import EmployeeSelfViewPage from './pages/EmployeeSelfViewPage'
import ScreenshotsPage from './pages/ScreenshotsPage'
import TimesheetsPage from './pages/TimesheetsPage'
import OTAFilesPage from './pages/OTAFilesPage'
import SettingsPage from './pages/SettingsPage'

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RestrictedModeProvider>
          <BrowserRouter>
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
                <Route path="screenshots" element={<ScreenshotsPage />} />
                <Route path="timesheets" element={<TimesheetsPage />} />
                <Route path="ota-files" element={<OTAFilesPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Routes>
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
