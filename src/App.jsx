import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth, RequireOrg, RequireRole, OWNER_ROLES } from './auth/ProtectedRoute'
import AppShell from './components/AppShell'

import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import AuthCallback from './pages/AuthCallback'
import Onboarding from './pages/Onboarding'

import Dashboard from './pages/Dashboard'
import Cases from './pages/Cases'
import CaseDetail from './pages/CaseDetail'
import IntakeForm from './pages/IntakeForm'
import Visits from './pages/Visits'
import VisitDetail from './pages/VisitDetail'
import VisitReport from './pages/VisitReport'
import Monitors from './pages/Monitors'
import MonitorDetail from './pages/MonitorDetail'
import MonitorProfile from './pages/MonitorProfile'
import Reports from './pages/Reports'
import Team from './pages/Team'
import Settings from './pages/Settings'

import ParentPortal from './pages/ParentPortal'
import AttorneyPortal from './pages/AttorneyPortal'

const OWNER_OR_MONITOR = [...OWNER_ROLES, 'monitor']

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Public portals — accessed via token, no Supabase auth required */}
        <Route path="/portal/parent/:token" element={<ParentPortal />} />
        <Route path="/portal/attorney/:token" element={<AttorneyPortal />} />

        <Route
          path="/onboarding"
          element={<RequireAuth><Onboarding /></RequireAuth>}
        />

        <Route element={<RequireAuth><RequireOrg><AppShell /></RequireOrg></RequireAuth>}>
          {/* Shared — dashboard renders role-specific content inside */}
          <Route path="/" element={<Dashboard />} />

          {/* Cases & visits: shared list/detail, filtered server-side per role */}
          <Route path="/cases" element={<Cases />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
          <Route path="/visits" element={<Visits />} />
          <Route path="/visits/:id" element={<VisitDetail />} />
          <Route
            path="/visits/:id/report"
            element={<RequireRole allow={OWNER_OR_MONITOR} redirect><VisitReport /></RequireRole>}
          />

          {/* Owner-only */}
          <Route
            path="/intake"
            element={<RequireRole allow={OWNER_ROLES} redirect><IntakeForm /></RequireRole>}
          />
          <Route
            path="/monitors"
            element={<RequireRole allow={OWNER_ROLES} redirect><Monitors /></RequireRole>}
          />
          <Route
            path="/monitors/:id"
            element={<RequireRole allow={OWNER_ROLES} redirect><MonitorDetail /></RequireRole>}
          />
          <Route
            path="/reports"
            element={<RequireRole allow={OWNER_ROLES} redirect><Reports /></RequireRole>}
          />
          <Route
            path="/team"
            element={<RequireRole allow={OWNER_ROLES} redirect><Team /></RequireRole>}
          />
          <Route
            path="/settings"
            element={<RequireRole allow={OWNER_ROLES} redirect><Settings /></RequireRole>}
          />

          {/* Monitor-only */}
          <Route
            path="/my-profile"
            element={<RequireRole allow={['monitor']} redirect><MonitorProfile /></RequireRole>}
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
