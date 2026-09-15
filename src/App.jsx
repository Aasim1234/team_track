import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from './hooks/useAuth'
import { PermissionsProvider, usePermissions, ADMIN_AREA_PERMISSIONS, ADMIN_PAGE_PERMISSIONS } from './hooks/usePermissions'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ProjectOverviewPage from './pages/ProjectOverviewPage'
import VmsTestPlansPage from './pages/VmsTestPlansPage'
import ActivityLogPage from './pages/ActivityLogPage'
import TestCoveragePage from './pages/TestCoveragePage'
import TodoPage from './pages/TodoPage'
import ReportsPage from './pages/ReportsPage'
import CommandPalette from './components/CommandPalette'
import NoAccessPage from './components/NoAccessPage'
import { ToastProvider } from './components/ui/Toast'
import AdminOverviewPage from './pages/admin/AdminOverviewPage'
import AdminProjectsPage from './pages/admin/AdminProjectsPage'
import AdminUsersRolesPage from './pages/admin/AdminUsersRolesPage'
import AdminTeamPerformancePage from './pages/admin/AdminTeamPerformancePage'
import AdminMemberProfilePage from './pages/admin/AdminMemberProfilePage'
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

function Loading() {
  return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>
}

// Signed-in pages. `need` lists permissions of which the user must have at
// least one; without them the page is replaced by a "no access" message. The
// database enforces the same permissions on every request regardless.
function ProtectedRoute({ children, need, title }) {
  const { user, loading } = useAuth()
  const { loading: permissionsLoading, canAny } = usePermissions()
  if (loading || (user && need && permissionsLoading)) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (need && !canAny(need)) return <PageTransition><NoAccessPage title={title} /></PageTransition>
  return <PageTransition>{children}</PageTransition>
}

// Administration pages: the area needs any admin-type permission, and each
// page its own (see ADMIN_PAGE_PERMISSIONS).
function AdminRoute({ children, page = '/admin' }) {
  const { user, loading } = useAuth()
  const { loading: permissionsLoading, canAny } = usePermissions()
  if (loading || (user && permissionsLoading)) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (!canAny(ADMIN_AREA_PERMISSIONS)) return <Navigate to="/dashboard" replace />
  if (!canAny(ADMIN_PAGE_PERMISSIONS[page])) return <Navigate to="/admin" replace />
  return <PageTransition>{children}</PageTransition>
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
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
            <ProtectedRoute need={['reports.view']} title="Test Coverage">
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
            <AdminRoute page="/admin/projects">
              <AdminProjectsPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AdminRoute page="/admin/users">
              <AdminUsersRolesPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/team-performance"
          element={
            <AdminRoute page="/admin/team-performance">
              <AdminTeamPerformancePage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/team-performance/:memberId"
          element={
            <AdminRoute page="/admin/team-performance">
              <AdminMemberProfilePage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/data-management"
          element={
            <AdminRoute page="/admin/data-management">
              <AdminDataManagementPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/site-settings"
          element={
            <AdminRoute page="/admin/site-settings">
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
            <ProtectedRoute need={['projects.view']} title="Project Overview">
              <ProjectOverviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/plans"
          element={
            <ProtectedRoute need={['test_plans.view']} title="VMS Test Plans">
              <VmsTestPlansPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/plans/:planId"
          element={
            <ProtectedRoute need={['test_plans.view']} title="VMS Test Plans">
              <VmsTestPlansPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/reports"
          element={
            <ProtectedRoute need={['reports.view']} title="Reports">
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/todo"
          element={
            <ProtectedRoute need={['test_cases.view']} title="To-Do">
              <TodoPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/activity"
          element={
            <ProtectedRoute need={['admin.audit_logs']} title="the Activity Log">
              <ActivityLogPage />
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
      <PermissionsProvider>
        <BrowserRouter>
          <CommandPalette />
          <AnimatedRoutes />
        </BrowserRouter>
      </PermissionsProvider>
    </ToastProvider>
  )
}

export default App
