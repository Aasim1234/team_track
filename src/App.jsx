import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from './hooks/useAuth'
import { useProjectAdminAccess } from './hooks/useProjectAdminAccess'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ProjectOverviewPage from './pages/ProjectOverviewPage'
import VmsTestPlansPage from './pages/VmsTestPlansPage'
import TestCoveragePage from './pages/TestCoveragePage'
import TodoPage from './pages/TodoPage'
import ReportsPage from './pages/ReportsPage'
import CommandPalette from './components/CommandPalette'
import { ToastProvider } from './components/ui/Toast'
import AdminOverviewPage from './pages/admin/AdminOverviewPage'
import AdminProjectsPage from './pages/admin/AdminProjectsPage'
import AdminUsersRolesPage from './pages/admin/AdminUsersRolesPage'
import AdminTeamPerformancePage from './pages/admin/AdminTeamPerformancePage'
import AdminMemberProfilePage from './pages/admin/AdminMemberProfilePage'
import AdminAiHubPage from './pages/admin/AdminAiHubPage'
import AdminCustomizationsPage from './pages/admin/AdminCustomizationsPage'
import AdminIntegrationPage from './pages/admin/AdminIntegrationPage'
import AdminDataManagementPage from './pages/admin/AdminDataManagementPage'
import AdminSiteSettingsPage from './pages/admin/AdminSiteSettingsPage'

// Fade + slight-upward-motion wrapper applied to every routed page. Living
// here (rather than wrapping each <Route element>) means the whole app gets
// consistent page-transition behavior from three edits instead of twenty.
function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return <PageTransition>{children}</PageTransition>
}

function AdminRoute({ children }) {
  const { user, loading: authLoading } = useAuth()
  const { isAdmin, loading: adminLoading } = useProjectAdminAccess()
  if (authLoading || adminLoading) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>
  }
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return <PageTransition>{children}</PageTransition>
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>
  if (user) return <Navigate to="/dashboard" replace />
  return <PageTransition>{children}</PageTransition>
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence>
      <Routes location={location} key={location.pathname}>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/coverage"
          element={
            <ProtectedRoute>
              <TestCoveragePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminOverviewPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/projects"
          element={
            <AdminRoute>
              <AdminProjectsPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminRoute>
              <AdminUsersRolesPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/team-performance"
          element={
            <AdminRoute>
              <AdminTeamPerformancePage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/team-performance/:memberId"
          element={
            <AdminRoute>
              <AdminMemberProfilePage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/ai-hub"
          element={
            <AdminRoute>
              <AdminAiHubPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/customizations"
          element={
            <AdminRoute>
              <AdminCustomizationsPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/integration"
          element={
            <AdminRoute>
              <AdminIntegrationPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/data-management"
          element={
            <AdminRoute>
              <AdminDataManagementPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/site-settings"
          element={
            <AdminRoute>
              <AdminSiteSettingsPage />
            </AdminRoute>
          }
        />
        <Route
          path="/project/:id"
          element={<Navigate to="overview" replace />}
        />
        <Route
          path="/project/:id/overview"
          element={
            <ProtectedRoute>
              <ProjectOverviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/plans"
          element={
            <ProtectedRoute>
              <VmsTestPlansPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/plans/:planId"
          element={
            <ProtectedRoute>
              <VmsTestPlansPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/reports"
          element={
            <ProtectedRoute>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/todo"
          element={
            <ProtectedRoute>
              <TodoPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <CommandPalette />
        <AnimatedRoutes />
      </BrowserRouter>
    </ToastProvider>
  )
}

export default App
