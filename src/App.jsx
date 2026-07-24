import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PlayCircle, Flag, BarChart3, CheckSquare } from 'lucide-react'
import { useAuth } from './hooks/useAuth'
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

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
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
