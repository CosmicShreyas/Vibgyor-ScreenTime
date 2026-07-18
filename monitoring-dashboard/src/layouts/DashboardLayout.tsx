import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Sidebar from '../components/Sidebar'
import TopBar from '../components/TopBar'
import CommandPalette from '../components/CommandPalette'
import { pageTransition } from '../components/ui/motion'

export default function DashboardLayout() {
  const location = useLocation()

  return (
    <div className="ms-aurora-bg min-h-screen text-[var(--foreground)]">
      <CommandPalette />
      <Sidebar />
      <div className="min-h-screen transition-[padding] duration-300 pl-[var(--sidebar-width,4.75rem)]">
        <TopBar />
        <main>
          <div className="mx-auto max-w-[1560px] px-4 py-5 sm:px-6 lg:px-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                variants={pageTransition}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}
