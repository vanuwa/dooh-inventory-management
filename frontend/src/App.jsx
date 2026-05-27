import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import UserPage from './pages/UserPage.jsx'
import Publishers from './pages/Publishers.jsx'
import PublisherDetail from './pages/PublisherDetail.jsx'
import PlacementDetail from './pages/PlacementDetail.jsx'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/user"
            element={
              <ProtectedRoute>
                <UserPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/publishers"
            element={
              <ProtectedRoute>
                <Publishers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/publishers/:id"
            element={
              <ProtectedRoute>
                <PublisherDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/publishers/:publisherId/placements/:placementId"
            element={
              <ProtectedRoute>
                <PlacementDetail />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/publishers" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
