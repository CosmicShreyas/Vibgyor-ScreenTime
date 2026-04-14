import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar'

export default function DashboardLayout() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-8">
        <Outlet />
      </main>
    </div>
  )
}
