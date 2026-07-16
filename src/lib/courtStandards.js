// Court-ready reporting standards, by state.
//
// Only VERIFIED statewide standards are listed — for a court-trust product,
// a fabricated citation is worse than a fallback. States without a codified
// statewide supervised-visitation practice standard fall back to the
// Supervised Visitation Network (SVN) Standards for Supervised Visitation
// Practice, the national professional benchmark, plus the individual court
// order. California's Standard 5.20 remains the engineering baseline the
// report format was built to.
//
// Verified 2026-07 (re-verify before adding entries):
// - CA: Standards of Judicial Administration, Standard 5.20
// - FL: Fla. Stat. ch. 753 — Supervised Visitation Programs
// - MN: Minn. Stat. § 119A.37 — Parenting Time Centers
// - UT: Utah Code — Supervised Parent-Time (§ 30-3-34.5; recodified into
//       Title 81 in 2024 — link below resolves via le.utah.gov)

export const COURT_STANDARDS = {
  CA: {
    label: 'CA Standard 5.20',
    name: 'California Standards of Judicial Administration, Standard 5.20',
    url: 'https://www.courts.ca.gov/cms/rules/index.cfm?title=five&linkid=rule5_20',
    stateSpecific: true,
  },
  FL: {
    label: 'Fla. Stat. ch. 753',
    name: 'Florida Statutes Chapter 753 — Supervised Visitation Programs',
    url: 'https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0700-0799/0753/0753.html',
    stateSpecific: true,
  },
  MN: {
    label: 'Minn. Stat. § 119A.37',
    name: 'Minnesota Statutes § 119A.37 — Parenting Time Centers',
    url: 'https://www.revisor.mn.gov/statutes/cite/119A.37',
    stateSpecific: true,
  },
  UT: {
    label: 'Utah Parent-Time Statute',
    name: 'Utah Code — Supervised Parent-Time',
    url: 'https://le.utah.gov/xcode/Title30/Chapter3/30-3-S34.5.html',
    stateSpecific: true,
  },
}

export const SVN_STANDARD = {
  label: 'SVN Practice Standards',
  name: 'Supervised Visitation Network — Standards for Supervised Visitation Practice',
  url: 'https://www.svnworldwide.org/svn-standards',
  stateSpecific: false,
}

// The standard reference to show for an org in `state` (2-letter code).
export function getCourtStandard(state) {
  return COURT_STANDARDS[state] || SVN_STANDARD
}

// One-line compliance statement for report footers / legal notices.
export function complianceLine(state) {
  if (state === 'CA') {
    return 'Provided per California Rule of Court, Standard 5.20.'
  }
  const std = COURT_STANDARDS[state]
  if (std) {
    return `Prepared pursuant to the court order and ${std.name}.`
  }
  return 'Prepared pursuant to the court order, aligned with SVN Standards for Supervised Visitation Practice.'
}
