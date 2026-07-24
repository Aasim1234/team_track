import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Flag } from 'lucide-react'
import { useAuth } from './hooks/useAuth'
import { useProjectAdminAccess } from './hooks/useProjectAdminAccess'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ProjectBoard from './pages/ProjectBoard'
import IssueDetailPage from './pages/IssueDetailPage'
import PlansPage from './pages/PlansPage'
import GoalsPage from './pages/GoalsPage'
import ProjectOverviewPage from './pages/ProjectOverviewPage'
import TestCasesPage from './pages/TestCasesPage'
import TestRunsPage from './pages/TestRunsPage'
import TodoPage from './pages/TodoPage'
import ReportsPage from './pages/ReportsPage'
import CommandPalette from './components/CommandPalette'
import ComingSoonPage from './components/ComingSoonPage'
import AdminOverviewPage from './pages/admin/AdminOverviewPage'
import AdminProjectsPage from './pages/admin/AdminProjectsPage'
import AdminUsersRolesPage from './pages/admin/AdminUsersRolesPage'
import AdminAiHubPage from './pages/admin/AdminAiHubPage'
import AdminCustomizationsPage from './pages/admin/AdminCustomizationsPage'
import AdminIntegrationPage from './pages/admin/AdminIntegrationPage'
import AdminDataManagementPage from './pages/admin/AdminDataManagementPage'
import AdminSiteSettingsPage from './pages/admin/AdminSiteSettingsPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const { user, loading: authLoading } = useAuth()
  const { isAdmin, loading: adminLoading } = useProjectAdminAccess()
  if (authLoading || adminLoading) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>
  }
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

function App() {
  return (
    <BrowserRouter>
      <CommandPalette />
      <Routes>
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
          path="/plans"
          element={
            <ProtectedRoute>
              <PlansPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/goals"
          element={
            <ProtectedRoute>
              <GoalsPage />
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
          path="/project/:id/cases"
          element={
            <ProtectedRoute>
              <TestCasesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/cases/:caseId"
          element={
            <ProtectedRoute>
              <TestCasesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/runs"
          element={
            <ProtectedRoute>
              <TestRunsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/runs/:runId"
          element={
            <ProtectedRoute>
              <TestRunsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/milestones"
          element={
            <ProtectedRoute>
              <ComingSoonPage
                title="Milestones"
                description="Track releases and sprints with real progress rollups from linked test runs."
                icon={Flag}
                phase="Phase 4"
              />
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
        <Route
          path="/project/:id/classic/*"
          element={
            <ProtectedRoute>
              <ProjectBoard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/issue/:issueId"
          element={
            <ProtectedRoute>
              <IssueDetailPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
