import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import {
  PlayCircle, Flag, BarChart3, CheckSquare, Sparkles, SlidersHorizontal, Plug, Database, Settings,
} from 'lucide-react'
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
import CommandPalette from './components/CommandPalette'
import ComingSoonPage from './components/ComingSoonPage'
import AdminOverviewPage from './pages/admin/AdminOverviewPage'
import AdminProjectsPage from './pages/admin/AdminProjectsPage'
import AdminUsersRolesPage from './pages/admin/AdminUsersRolesPage'
import AdminPlaceholderPage from './pages/admin/AdminPlaceholderPage'

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
              <AdminPlaceholderPage title="AI Hub" icon={Sparkles} description="AI-assisted test generation and suggestions will live here." />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/customizations"
          element={
            <AdminRoute>
              <AdminPlaceholderPage title="Customizations" icon={SlidersHorizontal} description="Custom fields, statuses, and templates will be configurable here." />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/integration"
          element={
            <AdminRoute>
              <AdminPlaceholderPage title="Integration" icon={Plug} description="Jira, GitHub, GitLab, and CI/CD integrations will be configurable here." />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/data-management"
          element={
            <AdminRoute>
              <AdminPlaceholderPage title="Data Management" icon={Database} description="Storage usage, exports, and attachment management will live here." />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/site-settings"
          element={
            <AdminRoute>
              <AdminPlaceholderPage title="Site Settings" icon={Settings} description="General, security, authentication, and email settings will live here." />
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
              <ComingSoonPage
                title="Test Runs & Results"
                description="Create test runs, select cases, execute them, and preserve full pass/fail history across runs."
                icon={PlayCircle}
                phase="Phase 2"
              />
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
              <ComingSoonPage
                title="Reports"
                description="Generate coverage, activity, and results reports from real execution data."
                icon={BarChart3}
                phase="Phase 5"
              />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:id/todo"
          element={
            <ProtectedRoute>
              <ComingSoonPage
                title="To-Do"
                description="See exactly which test runs and cases are assigned to you across this project."
                icon={CheckSquare}
                phase="Phase 3"
              />
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
