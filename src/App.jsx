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
import CaseDetail from './pages/CaseDetail'
import IntakeForm from './pages/IntakeForm'
import Visits from './pages/Visits'
import VisitDetail from './pages/VisitDetail'
import VisitReport from './pages/VisitReport'
import Monitors from './pages/Monitors'
import MonitorDetail from './pages/MonitorDetail'
import Team from './pages/Team'
import Settings from './pages/Settings'

import ParentPortal from './pages/ParentPortal'
import AttorneyPortal from './pages/AttorneyPortal'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Public portals — accessed via token, no Supabase auth required */}
        <Route path="/portal/parent/:token" element={<ParentPortal />} />
        <Route path="/portal/attorney/:token" element={<AttorneyPortal />} />

        <Route
          path="/onboarding"
          element={<RequireAuth><Onboarding /></RequireAuth>}
        />

        <Route element={<RequireAuth><RequireOrg><AppShell /></RequireOrg></RequireAuth>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cases" element={<Cases />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
          <Route path="/intake" element={<IntakeForm />} />
          <Route path="/visits" element={<Visits />} />
          <Route path="/visits/:id" element={<VisitDetail />} />
          <Route path="/visits/:id/report" element={<VisitReport />} />
          <Route path="/monitors" element={<Monitors />} />
          <Route path="/monitors/:id" element={<MonitorDetail />} />
          <Route path="/team" element={<Team />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
