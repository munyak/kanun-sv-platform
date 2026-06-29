import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { initAnalytics, trackPageView } from './lib/analytics'
import Landing from './pages/Landing'
import PilotApply from './pages/PilotApply'
import PilotAdmin from './pages/PilotAdmin'
import { RequireAuth, RequireOrg, RequireRole, RequireAdminEmail, OWNER_ROLES } from './auth/ProtectedRoute'
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
import PlatformAdmin from './pages/PlatformAdmin'
import MonitorProfile from './pages/MonitorProfile'
import Reports from './pages/Reports'
import Team from './pages/Team'
import Settings from './pages/Settings'
import ParentPortal from './pages/ParentPortal'
import AttorneyPortal from './pages/AttorneyPortal'
import Billing from './pages/Billing'
import Academy from './pages/Academy'
import AcademyScenario from './pages/AcademyScenario'
import AcademyTutor from './pages/AcademyTutor'
import AcademyQuiz from './pages/AcademyQuiz'
import TermsOfService from './pages/TermsOfService'
import PrivacyPolicy from './pages/PrivacyPolicy'
const OWNER_OR_MONITOR = [...OWNER_ROLES, 'monitor']

/* GA4: init once + page_view on every SPA route change (no-op unless
   VITE_GA_MEASUREMENT_ID is configured) */
function AnalyticsTracker() {
  const location = useLocation()
  useEffect(() => { initAnalytics() }, [])
  useEffect(() => { trackPageView(location.pathname) }, [location.pathname])
  return null
}

export default function App() {
  return (
    <AuthProvider>
      <AnalyticsTracker />
      <Routes>
        <Route path="/welcome" element={<Landing />} />
        {/* Public pilot-tester splash + application (also the front door at "/"
            for logged-out visitors, handled inside RequireAuth). */}
        <Route path="/apply" element={<PilotApply />} />
        {/* Munya's pilot approval queue — gated to admin emails. */}
        <Route path="/admin/pilots" element={<RequireAdminEmail><PilotAdmin /></RequireAdminEmail>} />
        <Route path="/login" element={<Login />} />
        {/* During the gated pilot, all new signups funnel through the
            pilot application + approval gate instead of open self-serve. */}
        <Route path="/signup" element={<Navigate to="/apply" replace />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />

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
          <Route
            path="/admin"
            element={<RequireRole allow={['platform_admin']} redirect><PlatformAdmin /></RequireRole>}
          />
          <Route
            path="/billing"
            element={<RequireRole allow={OWNER_ROLES} redirect><Billing /></RequireRole>}
          />

          {/* Monitor-only */}
          <Route
            path="/my-profile"
            element={<RequireRole allow={['monitor']} redirect><MonitorProfile /></RequireRole>}
          />

          {/* Academy — accessible to monitors + owners */}
          <Route
            path="/academy"
            element={<RequireRole allow={OWNER_OR_MONITOR} redirect><Academy /></RequireRole>}
          />
          <Route
            path="/academy/scenario"
            element={<RequireRole allow={OWNER_OR_MONITOR} redirect><AcademyScenario /></RequireRole>}
          />
          <Route
            path="/academy/tutor"
            element={<RequireRole allow={OWNER_OR_MONITOR} redirect><AcademyTutor /></RequireRole>}
          />
          <Route
            path="/academy/quiz"
            element={<RequireRole allow={OWNER_OR_MONITOR} redirect><AcademyQuiz /></RequireRole>}
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
