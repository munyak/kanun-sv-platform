/**
 * KaNun Academy — Shared utilities and LLM client
 */

const LLM_ENDPOINT = '/.netlify/functions/llm';

/**
 * Call the LLM proxy with a given mode and payload.
 */
export async function callLLM({ mode, messages, domain, difficulty, count, bloomsLevel }) {
  const resp = await fetch(LLM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, messages, domain, difficulty, count, bloomsLevel }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `LLM request failed: ${resp.status}`);
  }
  return resp.json();
}

/**
 * Parse JSON from LLM response content (handles markdown code fences).
 */
export function parseLLMJson(content) {
  // Strip markdown code fences if present
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(cleaned);
}

/**
 * Domain definitions for the KaNun Certified Monitor competency framework.
 */
export const DOMAINS = [
  {
    id: 1,
    name: 'Legal Foundations & Ethical Practice',
    short: 'Legal & Ethics',
    weight: '15%',
    hours: 6,
    icon: '⚖️',
    color: '#2563A8',
    topics: [
      'Family law fundamentals',
      'Mandated reporting',
      'Confidentiality & HIPAA',
      'Professional boundaries',
      'Ethical decision-making (SAFE Model)',
      'Court testimony preparation',
    ],
  },
  {
    id: 2,
    name: 'Child Safety & Developmental Awareness',
    short: 'Child Safety',
    weight: '25%',
    hours: 10,
    icon: '🛡️',
    color: '#2E7D4F',
    topics: [
      'Child development milestones',
      'Attachment theory & disruption',
      'Trauma indicators (ACEs)',
      'Child interview techniques',
      'Safety assessment during visits',
      'Special populations',
    ],
  },
  {
    id: 3,
    name: 'DV, Substance Abuse & Behavioral Risk',
    short: 'DV & Risk',
    weight: '25%',
    hours: 10,
    icon: '🔍',
    color: '#C43025',
    topics: [
      'Domestic violence dynamics',
      'Substance abuse recognition',
      'Mental health awareness',
      'Risk assessment frameworks',
      'Cultural considerations & bias',
    ],
  },
  {
    id: 4,
    name: 'SV Operations & Documentation',
    short: 'Operations & Docs',
    weight: '20%',
    hours: 8,
    icon: '📋',
    color: '#C6860A',
    topics: [
      'Visit planning & preparation',
      'Multi-party scheduling',
      'Observation techniques (SOBO)',
      'Report writing mastery',
      'GPS & digital documentation',
      'Evidence handling',
    ],
  },
  {
    id: 5,
    name: 'Crisis Management & Professional Resilience',
    short: 'Crisis & Resilience',
    weight: '15%',
    hours: 6,
    icon: '🚨',
    color: '#7C3AED',
    topics: [
      'Advanced de-escalation (CALM)',
      'Emergency protocols',
      'Secondary trauma prevention',
      'Implicit bias mitigation',
      'Professional self-care',
      'Virtual visitation safety',
    ],
  },
];

export const TOTAL_HOURS = DOMAINS.reduce((s, d) => s + d.hours, 0); // 40

/**
 * Certification tiers.
 */
export const TIERS = [
  { key: 'KCM',  name: 'KaNun Certified Monitor',          color: '#CD7F32', level: 'Bronze' },
  { key: 'KACM', name: 'KaNun Advanced Certified Monitor',  color: '#C0C0C0', level: 'Silver' },
  { key: 'KMM',  name: 'KaNun Master Monitor',              color: '#D4AF37', level: 'Gold'   },
];
