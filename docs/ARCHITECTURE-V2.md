# KaNun Monitoring Platform — Product Architecture v2

**"SimplePractice for Supervised Visitation"**
Prepared: May 24, 2026

---

## Executive Summary

The current deployed MVP (kanunmonitoring.com — hosted on Netlify) is an internal case management tool — single-user, no auth, no multi-tenancy, no onboarding. To compete at SimplePractice's maturity level and surpass VisitProof, the platform needs a ground-up architecture redesign covering multi-tenant organization management, role-based access, self-service onboarding, client-facing portals, mobile-first monitor tooling, and court/attorney read-only access.

This document defines the target architecture, feature set, user roles, and phased build plan.

---

## Competitive Landscape

### VisitProof (Current Leader)
- **Metrics:** 199 registered orgs, only 25 active supervisors, 256 families, 11 states
- **Pricing:** $25/seat/month, custom enterprise tier
- **Strengths:** AI report generation, basic case management, scheduling
- **Critical Gaps:** No parent portal, no court/attorney portal, no virtual visitation, no certification tracking, no mobile app, no billing/invoicing, no e-signatures on base plan, no API
- **Tech:** Next.js, solo founder (Adam Cooper)
- **Assessment:** Early stage, hasn't found PMF. Beatable.

### VISIMON
- **Pricing:** $60-180/month
- **Focus:** Visit documentation and reporting
- **Gaps:** No multi-tenant, limited integrations

### SimplePractice (Maturity Benchmark)
- **What makes it feel "mature":**
  - Guided onboarding wizard (practice info → services → availability → first client)
  - 5 user roles with granular permissions (Owner, Admin, Clinician tiers, Billing)
  - Branded client portal (booking, forms, documents, messaging, telehealth)
  - Custom intake forms with e-signatures and auto-send workflows
  - Integrated billing (insurance claims, superbills, Stripe payments)
  - Mobile apps for both providers and clients
  - Calendar sync (Google, Apple, Outlook)
  - HIPAA-compliant messaging
  - $49-99/month per clinician

---

## KaNun Monitoring — User Roles & Permissions

### 1. Platform Admin (KaNun Staff)
- Full platform access across all organizations
- Manage subscription tiers, billing, feature flags
- View aggregate analytics and platform health
- Manage certification programs and training content

### 2. Agency Owner / Organization Admin
- Creates and manages the organization (agency)
- Manages subscription and billing
- Invites and manages staff (monitors, supervisors, admins)
- Configures organization settings (service areas, pricing, court affiliations)
- Views all cases, reports, and analytics across the org
- Manages monitor assignments and workload balancing

### 3. Agency Manager / Supervisor
- Views and manages cases assigned to their team
- Reviews and co-signs monitor reports before court submission
- Manages monitor schedules and assignments
- Runs reports (utilization, compliance, revenue)
- Cannot modify billing or subscription settings

### 4. Monitor (Field Staff)
- Mobile-first experience — this is their primary interface
- Views assigned cases and visit schedules
- Conducts visits with real-time documentation (observation notes, timestamps, incident flags)
- Submits visit reports for supervisor review
- Tracks own training hours, certifications, LiveScan/TrustLine status
- Receives push notifications (schedule changes, reminders, alerts)
- Cannot see other monitors' cases or org-level settings

### 5. Parent / Guardian (Client Portal)
- Self-service portal accessible via unique link (no app download required)
- Views upcoming visit schedule
- Completes intake forms and e-signs agreements
- Uploads required documents (court orders, IDs, insurance)
- Receives automated reminders (72hr, 24hr, 2hr before visits)
- Views visit summary (not full monitor notes — only court-approved summary)
- Makes payments (if self-pay)
- CANNOT see the other parent's contact info, address, or notes (confidentiality firewall per Standard 5.20(j)(4))

### 6. Attorney (Read-Only Portal)
- Read-only access to cases they're linked to
- Views visit history, status, and compliance summary
- Downloads court-ready reports (PDF with FL-324(P) attachment)
- Receives notifications when reports are filed
- Cannot modify any data

### 7. Court / DCFS Liaison (Read-Only Portal)
- Read-only access to cases referred by their court/agency
- Views compliance dashboard (visits completed vs. ordered, no-shows, incidents)
- Downloads reports
- Can flag cases for review

---

## Multi-Tenant Architecture

### Current State (MVP)

Single Supabase project → flat tables → no auth → no org isolation

### Target Architecture

Supabase Auth (email/password + magic link)
  ↓
JWT with custom claims: { org_id, role, user_id }
  ↓
Row Level Security (RLS) policies filter ALL queries by org_id
  ↓
Each organization is a complete data silo

### Key Database Changes

**New tables needed:**
- sv_users — auth users with role assignments (links to Supabase Auth)
- sv_user_roles — maps users to orgs with specific roles (supports multi-org)
- sv_invitations — pending invites with role and expiration
- sv_subscriptions — org subscription tier, Stripe customer/subscription IDs
- sv_onboarding_progress — tracks setup wizard completion per org
- sv_intake_form_templates — customizable intake forms per org
- sv_e_signatures — captured signatures with timestamps and IP
- sv_payments — payment records (parent payments to agency)
- sv_invoices — generated invoices
- sv_notifications — in-app and push notification queue
- sv_training_modules — certification training content
- sv_training_completions — monitor training progress
- sv_portal_access_tokens — secure tokens for parent/attorney portal access

**Modified tables:**
- ALL existing sv_* tables get org_id column + RLS policies
- sv_monitors gets user_id foreign key to Supabase Auth
- sv_cases gets attorney_cp_id, attorney_ncp_id for portal access
- sv_visits gets check_in_time, check_out_time, gps_lat, gps_lng for mobile check-in
- sv_reports gets status enum: draft → submitted → reviewed → approved → filed
- sv_parties gets portal_access_token for parent portal login

---

## Feature Map by Phase

### Phase 1: Foundation (Weeks 1-4) — "Make it real"

**Auth & Multi-Tenancy**
- Supabase Auth integration (email/password + magic link)
- Organization creation during signup
- Role-based access control on every route
- RLS policies on all tables
- Invite flow (agency owner invites monitors/managers via email)

**Onboarding Wizard** (SimplePractice pattern)
- Step 1: Organization info (name, address, license #, service areas)
- Step 2: Services offered (supervised visitation, monitored exchange, therapeutic supervision)
- Step 3: Pricing configuration (hourly rates, minimum duration, cancellation fees)
- Step 4: Court affiliations (which courts you serve)
- Step 5: Invite your first monitor
- Step 6: Create your first case

**Dashboard Redesign**
- Role-aware: Agency Owner sees org-wide metrics, Monitor sees their assignments
- Today's schedule prominently displayed
- Action items (reports pending review, unsigned documents, expiring certifications)
- Revenue summary (for Owner/Manager roles)

**Navigation Redesign**
- Top bar with org name, user avatar, role badge, notifications bell
- Sidebar organized by role capabilities
- Mobile-responsive hamburger menu

### Phase 2: Core Operations (Weeks 5-8) — "Run the business"

**Enhanced Case Management**
- Case detail view (not just list) — full case timeline with all activity
- Document management per case (court orders, agreements, correspondence)
- Case status workflow: Intake → Pending Assignment → Active → Suspended → Completed → Archived
- Bulk actions (assign monitor to multiple cases, status changes)

**Scheduling Engine**
- Calendar view (day/week/month) with drag-and-drop
- Recurring visit templates
- Monitor availability management (working hours, blocked dates, PTO)
- Conflict detection (double-booking prevention)
- Staggered arrival scheduling (custodial arrives 15 min before noncustodial per 5.20)
- Google Calendar / Apple Calendar sync (iCal export)

**Mobile Monitor App** (PWA first, native later)
- Visit check-in with GPS verification
- Real-time observation logging (structured prompts + free text)
- Incident flagging with severity levels
- Photo/document capture (with EXIF metadata)
- Timer for visit duration tracking
- Offline support (sync when connection returns)
- One-tap emergency protocols

**Report Generation**
- AI-assisted report drafting from observation notes
- Court-ready PDF output with FL-324(P) attachment
- Report review workflow: Monitor drafts → Supervisor reviews → Approved → Filed
- Template library (standard report, incident report, termination report)
- Auto-population of case details, visit history, compliance metrics

### Phase 3: Portals & Payments (Weeks 9-12) — "Serve all stakeholders"

**Parent Portal**
- Secure access via magic link (no password needed)
- View upcoming visits with date/time/location
- Complete intake forms with e-signatures
- Upload required documents
- View visit summaries (redacted per confidentiality rules)
- Make payments (Stripe integration)
- Automated reminders via SMS and email
- Confidentiality firewall — each parent sees ONLY their own info

**Attorney Portal**
- Read-only dashboard showing linked cases
- Compliance overview (visits completed vs. court-ordered)
- Download court-ready reports
- Notification preferences

**Billing & Invoicing**
- Service rate configuration per case (can override org defaults)
- Auto-generated invoices after completed visits
- Stripe payment processing (ACH, credit card)
- Invoice PDF generation and email delivery
- Payment tracking and aging reports
- Sliding scale / income-based fee support

**E-Signatures**
- Inline signature capture on intake forms and agreements
- Legally binding with timestamp, IP, and user agent logging
- Required signatures: service agreement, confidentiality acknowledgment, mandated reporter disclosure

### Phase 4: Differentiation (Weeks 13-16) — "Win the market"

**Court/DCFS Portal**
- Read-only compliance dashboard by case or by provider
- Aggregate provider performance metrics
- Secure report delivery (replaces snail mail)
- API for court case management system integration

**Certification & Training**
- Training module library (videos, quizzes, reading materials)
- Progress tracking per monitor
- Automatic certification expiration alerts
- Continuing education credit tracking
- Annual recertification workflow

**Advanced Analytics**
- Organization health dashboard (utilization, revenue, compliance rates)
- Monitor performance metrics (on-time rate, report quality scores, client satisfaction)
- Court compliance reporting (visits ordered vs. completed, continuity metrics)
- Revenue forecasting

**Virtual/Hybrid Visitation**
- Integrated video calls for virtual supervised visits
- Screen recording capability for documentation
- Virtual waiting room (staggered entry)
- Hybrid mode (some in-person, some virtual per court order)

**API & Integrations**
- RESTful API for court system integration
- Webhook support for real-time notifications
- QuickBooks/Xero integration for accounting
- Twilio integration for SMS notifications

---

## Pricing Strategy

| Tier | Price | Target | Includes |
|------|-------|--------|----------|
| **Starter** | $29/monitor/month | Solo monitors, Lisa-type operators | 1 org, up to 3 monitors, basic scheduling, reports, parent portal |
| **Professional** | $49/monitor/month | Growing agencies (5-15 monitors) | Everything in Starter + billing/invoicing, attorney portal, calendar sync, AI reports, e-signatures |
| **Enterprise** | $79/monitor/month | Large agencies, county contracts | Everything in Pro + court portal, API access, custom branding, virtual visitation, training/certification, dedicated support |
| **Platform** | Custom | County/state contracts | Multi-agency management, aggregate reporting, SLA guarantees |

**Comparison:** VisitProof charges $25/seat with fewer features. Our Starter at $29 with parent portal already beats them. Professional at $49 with full portal suite and AI reports is the sweet spot.

---

## Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React + Vite + TailwindCSS | Already started, fast iteration |
| Auth | Supabase Auth | Built-in, JWT-based, magic links, RBAC |
| Database | Supabase (PostgreSQL) | Already deployed, RLS, real-time subscriptions |
| File Storage | Supabase Storage | Integrated, S3-compatible, signed URLs |
| Payments | Stripe | Industry standard, Connect for marketplace model |
| SMS/Notifications | Twilio | Reliable, programmable |
| Email | SendGrid or Resend | Transactional + template support |
| PDF Generation | React-PDF or Puppeteer | Court-ready document output |
| Mobile | PWA (Phase 2), React Native (Phase 4+) | PWA gets us mobile fast without app store friction |
| Video | Daily.co or Twilio Video | Virtual visitation in Phase 4 |
| AI Reports | Anthropic Claude API | Report drafting from structured observations |
| Hosting | Netlify (frontend) + Supabase (backend) | Already configured |
| Monitoring | Sentry + Supabase Dashboard | Error tracking + DB monitoring |

---

## Immediate Next Steps (This Week)

1. **Implement Supabase Auth** — email/password signup, magic links, JWT custom claims with org_id and role
2. **Redesign database** — add org_id to all tables, create user/role/invitation tables, write RLS policies
3. **Build onboarding wizard** — org creation flow that replaces the current "just land on dashboard" experience
4. **Implement invite flow** — agency owner can invite monitors via email with role assignment
5. **Role-based routing** — different dashboard views and nav items based on authenticated user's role

---

## Revenue Projection

**Conservative scenario** (first 6 months post-launch):
- Month 1-2: Lisa's agency (6 monitors x $49 = $294/mo) + 2 solo monitors ($58/mo) = ~$350/mo
- Month 3-4: Add 3 agencies from LA County monitor list ($735/mo) + 5 solos ($145/mo) = ~$1,230/mo
- Month 5-6: Word of mouth + court referrals, 8 agencies + 15 solos = ~$2,800/mo

**Aggressive scenario** (with court partnership + Lisa evangelizing):
- Month 3: 5 agencies x avg 4 monitors x $49 = $980/mo
- Month 6: 15 agencies x avg 5 monitors x $49 = $3,675/mo
- Month 9: 30 agencies + court contract = $7,000-10,000/mo

**Path to $10K MRR:** ~30 agencies on Professional tier OR 1-2 county contracts on Enterprise/Platform tier.

---

## What This Replaces

The current MVP becomes a throwaway prototype. The codebase structure (React + Supabase + Netlify) carries forward, but virtually every component needs to be rebuilt with auth, multi-tenancy, and role-awareness baked in from the ground up. The database schema expands from 15 tables to ~30. The UI shifts from a single admin view to role-specific experiences.

This is not a refactor — it's a v2 build using v1 as a learning exercise.
