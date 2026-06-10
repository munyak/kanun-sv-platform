import React from 'react'
import { Link } from 'react-router-dom'

export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page, #f8f8f6)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }}>
        <Link to="/welcome" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-tertiary, #888)', textDecoration: 'none', marginBottom: 32 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </Link>

        <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary, #1a1a1a)', marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary, #888)', marginBottom: 40 }}>Last updated: June 10, 2026</p>

        <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary, #555)' }}>
          <Section title="1. Introduction">
            <p>KaNun Monitoring ("the Platform"), operated by KaNun Digital LLC ("Company", "we", "us"), is committed to protecting the privacy of all users, with particular attention to the sensitive nature of supervised visitation data involving minors. This Privacy Policy explains how we collect, use, store, and protect your information.</p>
          </Section>

          <Section title="2. Information We Collect">
            <p><strong>Account information:</strong> Name, email address, phone number, and professional credentials when you register for an account.</p>
            <p><strong>Visit data:</strong> Scheduled visit details, real-time observations, incident reports, voice narrations and transcriptions, timestamps, and visit outcomes recorded during supervised visits.</p>
            <p><strong>Location data:</strong> GPS coordinates collected from monitors only during active (checked-in) supervised visits. Location tracking ceases immediately upon visit checkout.</p>
            <p><strong>Background check data:</strong> Name, date of birth, address, and Social Security Number submitted for background check processing. SSN data is transmitted directly to our background check provider (Certn) and is not stored in KaNun Monitoring systems.</p>
            <p><strong>Case information:</strong> Party names, case numbers, court orders, attorney contacts, and other case-related details entered by authorized users.</p>
            <p><strong>Usage data:</strong> Login times, feature usage, device information, and browser type for platform improvement and security monitoring.</p>
          </Section>

          <Section title="3. How We Use Your Information">
            <p>We use collected information to provide and operate the supervised visitation management platform, process background checks through authorized third-party providers, generate court-ready visit reports, verify visit locations and monitor compliance, send service-related communications (visit reminders, status updates, account notifications), improve Platform functionality and user experience, and comply with legal obligations and court orders.</p>
          </Section>

          <Section title="4. Information About Minors">
            <p>The Platform processes information related to supervised visits involving minors. We take additional precautions with this data. We minimize the collection of minors' personally identifiable information. Access to case data involving minors is restricted to authorized users with appropriate roles. We do not sell, share, or use minors' information for marketing purposes. All data involving minors is encrypted in transit and at rest.</p>
          </Section>

          <Section title="5. Data Storage and Security">
            <p>All data is stored on Supabase infrastructure with servers located in the United States. We employ industry-standard security measures including encryption in transit (TLS 1.2+) and at rest, row-level security policies restricting data access by user role, secure authentication with encrypted password storage, regular security audits and access reviews, and role-based access controls ensuring users only see data relevant to their function.</p>
          </Section>

          <Section title="6. Third-Party Services">
            <p>We use the following third-party services that may process your data:</p>
            <p><strong>Supabase:</strong> Database hosting, authentication, and serverless functions. Data stored in US-based servers.</p>
            <p><strong>Certn:</strong> Background check processing. Receives applicant personal information including SSN for the purpose of conducting criminal record checks. Certn's privacy practices are governed by their own privacy policy.</p>
            <p><strong>Netlify:</strong> Website hosting and content delivery.</p>
            <p>We do not sell your personal information to any third party. We share data with third parties only as necessary to provide the services described above.</p>
          </Section>

          <Section title="7. Data Retention">
            <p>We retain account data for as long as your account is active. Visit records and reports are retained for a minimum of seven (7) years to comply with typical record-keeping requirements for supervised visitation services. Background check results are retained as part of the monitor's compliance record. You may request deletion of your account data by contacting us, subject to legal retention requirements.</p>
          </Section>

          <Section title="8. Your Rights">
            <p>Depending on your jurisdiction, you may have the right to access the personal information we hold about you, request correction of inaccurate information, request deletion of your data (subject to legal retention requirements), opt out of non-essential communications, request a copy of your data in a portable format, and lodge a complaint with a supervisory authority.</p>
            <p>To exercise these rights, contact us at privacy@kanun.digital.</p>
          </Section>

          <Section title="9. California Privacy Rights (CCPA/CPRA)">
            <p>California residents have additional rights under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA). We do not sell personal information. We do not use personal information for cross-context behavioral advertising. You have the right to know what personal information we collect, request deletion, and not be discriminated against for exercising your privacy rights.</p>
          </Section>

          <Section title="10. Cookies and Tracking">
            <p>The Platform uses essential cookies for authentication and session management. We do not use advertising cookies or third-party tracking pixels. Analytics data is collected in aggregate form for platform improvement purposes only.</p>
          </Section>

          <Section title="11. Data Breach Notification">
            <p>In the event of a data breach that may compromise your personal information, we will notify affected users within 72 hours of discovery via email and in-platform notification, in compliance with applicable breach notification laws.</p>
          </Section>

          <Section title="12. Changes to This Policy">
            <p>We may update this Privacy Policy from time to time. We will notify registered users of material changes via email at least 30 days before the changes take effect. Continued use of the Platform after changes constitutes acceptance of the updated policy.</p>
          </Section>

          <Section title="13. Contact Us">
            <p>For privacy-related questions or to exercise your rights, contact us at:</p>
            <p>KaNun Digital LLC<br/>Email: privacy@kanun.digital<br/>Los Angeles, California</p>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary, #1a1a1a)', marginBottom: 8 }}>{title}</h2>
      {children}
    </div>
  )
}
