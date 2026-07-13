import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { useLicense } from './hooks/useLicense'
import Login from './pages/Login'
import ActivateLicense from './pages/ActivateLicense'
import Dashboard from './pages/Dashboard'
import ProjectBoard from './pages/ProjectBoard'
import IssueDetailPage from './pages/IssueDetailPage'

function ProtectedRoute({ children }) {
  const { user, loading: authLoading } = useAuth()
  const { isApproved, loading: licenseLoading } = useLicense()

  if (authLoading || licenseLoading) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>
  }
  if (!user) return <Navigate to="/login" replace />
  if (!isApproved) return <Navigate to="/activate" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

function ActivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function App() {
  return (
    <BrowserRouter>
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
          path="/activate"
          element={
            <ActivateRoute>
              <ActivateLicense />
            </ActivateRoute>
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
          path="/project/:id"
          element={
            <ProtectedRoute>
              <ProjectBoard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:projectId/issue/:issueId"
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
