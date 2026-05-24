import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth, RequireOrg } from './auth/ProtectedRoute'
import AppShell from './components/AppShell'

import Login from './pages/Login'
import Signup from './pages/Signup'
import AuthCallback from './pages/AuthCallback'
import Onboarding from './pages/Onboarding'

import Dashboard from './pages/Dashboard'
import Cases from './pages/Cases'
import IntakeForm from './pages/IntakeForm'
import Visits from './pages/Visits'
import Monitors from './pages/Monitors'
import Team from './pages/Team'
import Settings from './pages/Settings'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route
          path="/onboarding"
          element={<RequireAuth><Onboarding /></RequireAuth>}
        />

        <Route element={<RequireAuth><RequireOrg><AppShell /></RequireOrg></RequireAuth>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/intake" element={<IntakeForm />} />
          <Route path="/visits" element={<Visits />} />
          <Route path="/monitors" element={<Monitors />} />
          <Route path="/team" element={<Team />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
