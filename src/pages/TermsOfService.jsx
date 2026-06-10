import React from 'react'
import { Link } from 'react-router-dom'

export default function TermsOfService() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page, #f8f8f6)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }}>
        <Link to="/welcome" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-tertiary, #888)', textDecoration: 'none', marginBottom: 32 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </Link>

        <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary, #1a1a1a)', marginBottom: 8 }}>Terms of Service</h1>
        <p style={{ fontSize: 14, color: 'var(--text-tertiary, #888)', marginBottom: 40 }}>Last updated: June 10, 2026</p>

        <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary, #555)' }}>
          <Section title="1. Agreement to Terms">
            <p>By accessing or using KaNun Monitoring ("the Platform"), operated by KaNun Digital LLC ("Company", "we", "us"), you agree to be bound by these Terms of Service. If you are using the Platform on behalf of an organization, you represent that you have authority to bind that organization to these terms.</p>
          </Section>

          <Section title="2. Description of Service">
            <p>KaNun Monitoring is a supervised visitation management platform that provides tools for scheduling, conducting, documenting, and reporting on supervised visits between parents and children. The Platform includes visit scheduling, real-time observation recording, GPS tracking during active visits, court-ready report generation, background check processing through third-party providers, and secure communication between parties.</p>
          </Section>

          <Section title="3. User Accounts and Roles">
            <p>The Platform supports multiple user roles including agency owners, agency managers, monitors, attorneys, and court liaisons. Each role has specific permissions and responsibilities. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must immediately notify us of any unauthorized use.</p>
          </Section>

          <Section title="4. Background Checks">
            <p>Background checks are processed through Certn, a third-party background check provider. By submitting information for a background check, you represent that you have obtained proper consent from the individual being screened and that you have a permissible purpose under the Fair Credit Reporting Act (FCRA) and applicable state laws. KaNun Monitoring does not store Social Security Numbers — this data is transmitted directly to Certn via encrypted connection.</p>
          </Section>

          <Section title="5. Data Handling and Child Safety">
            <p>Given the sensitive nature of supervised visitation involving minors, all users must comply with applicable child protection laws. Users must not share case information outside authorized channels, must protect the identity and privacy of minors at all times, and must report any suspected child abuse or neglect to appropriate authorities as required by law. Visit observations, recordings, and reports may contain sensitive information about minors and must be treated with the highest level of confidentiality.</p>
          </Section>

          <Section title="6. GPS Location Tracking">
            <p>During active supervised visits, the Platform may collect GPS location data from monitors to verify visit locations. Location tracking is only active during checked-in visits and ceases immediately upon checkout. Location data is stored securely and used solely for visit verification and court reporting purposes.</p>
          </Section>

          <Section title="7. Acceptable Use">
            <p>You agree not to use the Platform to violate any laws or regulations, submit false or misleading information, attempt to access accounts or data belonging to other users, interfere with or disrupt the Platform's operation, use the Platform for any purpose other than legitimate supervised visitation management, or share access credentials with unauthorized individuals.</p>
          </Section>

          <Section title="8. Agency Responsibilities">
            <p>Agency owners and managers are responsible for ensuring their monitors are properly trained and credentialed, maintaining accurate records, complying with all applicable state and local regulations governing supervised visitation, and verifying that all personnel have passed required background checks before conducting visits.</p>
          </Section>

          <Section title="9. Fees and Payment">
            <p>Certain Platform features require payment, including background checks and premium subscription tiers. Fees are as quoted at the time of purchase. We reserve the right to modify pricing with 30 days notice. Background check fees are non-refundable once processing has begun.</p>
          </Section>

          <Section title="10. Intellectual Property">
            <p>The Platform, including its design, code, and documentation, is the intellectual property of KaNun Digital LLC. Reports and observations generated by users remain the property of the respective agencies, subject to applicable court orders and regulations.</p>
          </Section>

          <Section title="11. Disclaimer of Warranties">
            <p>The Platform is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not warrant that the Platform will be uninterrupted, error-free, or secure. KaNun Monitoring is a tool to assist with supervised visitation management — it does not replace professional judgment or legal advice.</p>
          </Section>

          <Section title="12. Limitation of Liability">
            <p>To the maximum extent permitted by law, KaNun Digital LLC shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform. Our total liability shall not exceed the amount you have paid us in the twelve months preceding the claim.</p>
          </Section>

          <Section title="13. Indemnification">
            <p>You agree to indemnify and hold harmless KaNun Digital LLC from any claims, damages, or expenses arising from your use of the Platform, your violation of these Terms, or your violation of any rights of a third party.</p>
          </Section>

          <Section title="14. Termination">
            <p>We may suspend or terminate your access to the Platform at any time for violation of these Terms. Upon termination, your right to use the Platform ceases immediately. Provisions regarding intellectual property, limitation of liability, and indemnification survive termination.</p>
          </Section>

          <Section title="15. Governing Law">
            <p>These Terms are governed by the laws of the State of California, without regard to conflict of law principles. Any disputes shall be resolved in the courts located in Los Angeles County, California.</p>
          </Section>

          <Section title="16. Changes to Terms">
            <p>We may update these Terms from time to time. We will notify registered users of material changes via email. Continued use of the Platform after changes constitutes acceptance of the updated Terms.</p>
          </Section>

          <Section title="17. Contact">
            <p>For questions about these Terms, contact us at legal@kanun.digital or KaNun Digital LLC, Los Angeles, CA.</p>
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
