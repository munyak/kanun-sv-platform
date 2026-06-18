import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DOMAINS, TOTAL_HOURS, TIERS } from '../lib/academy'
import '../components/academy.css'

/**
 * KaNun Academy — Main dashboard
 * Shows the 5 competency domains, progress overview, and entry points
 * to Scenario Simulator, AI Tutor, and Practice Quizzes.
 */
export default function Academy() {
  const nav = useNavigate()
  const [activeTab, setActiveTab] = useState('domains')

  return (
    <div className="academy-page">
      {/* Hero banner */}
      <div className="academy-hero">
        <div className="academy-hero-content">
          <div className="academy-hero-badge">KaNun Academy</div>
          <h1>KaNun Certified Monitor™ Program</h1>
          <p>
            {TOTAL_HOURS}-hour adaptive learning curriculum powered by AI.
            Master five competency domains through interactive scenarios,
            Socratic tutoring, and rigorous practice assessments.
          </p>
          <div className="academy-hero-stats">
            <div className="stat-pill"><span className="stat-num">{DOMAINS.length}</span> Domains</div>
            <div className="stat-pill"><span className="stat-num">{TOTAL_HOURS}</span> Hours</div>
            <div className="stat-pill"><span className="stat-num">3</span> Certification Tiers</div>
          </div>
        </div>
      </div>

      {/* Quick-launch tools */}
      <div className="academy-tools">
        <button className="tool-card tool-scenario" onClick={() => nav('/academy/scenario')}>
          <div className="tool-icon">🎭</div>
          <div className="tool-info">
            <h3>AI Scenario Simulator</h3>
            <p>Practice real-world supervised visitation scenarios with AI evaluation</p>
          </div>
          <span className="tool-arrow">→</span>
        </button>
        <button className="tool-card tool-tutor" onClick={() => nav('/academy/tutor')}>
          <div className="tool-icon">🧠</div>
          <div className="tool-info">
            <h3>AI Tutor</h3>
            <p>Ask questions and learn through Socratic guidance</p>
          </div>
          <span className="tool-arrow">→</span>
        </button>
        <button className="tool-card tool-quiz" onClick={() => nav('/academy/quiz')}>
          <div className="tool-icon">📝</div>
          <div className="tool-info">
            <h3>Practice Assessment</h3>
            <p>Test your knowledge with adaptive practice questions</p>
          </div>
          <span className="tool-arrow">→</span>
        </button>
      </div>

      {/* Tab navigation */}
      <div className="academy-tabs">
        <button className={`tab-btn ${activeTab === 'domains' ? 'active' : ''}`} onClick={() => setActiveTab('domains')}>
          Competency Domains
        </button>
        <button className={`tab-btn ${activeTab === 'tiers' ? 'active' : ''}`} onClick={() => setActiveTab('tiers')}>
          Certification Tiers
        </button>
      </div>

      {/* Domain cards */}
      {activeTab === 'domains' && (
        <div className="domain-grid">
          {DOMAINS.map(d => (
            <div key={d.id} className="domain-card" style={{ '--domain-color': d.color }}>
              <div className="domain-header">
                <span className="domain-icon">{d.icon}</span>
                <span className="domain-weight">{d.weight}</span>
              </div>
              <h3 className="domain-name">{d.name}</h3>
              <div className="domain-hours">{d.hours} hours</div>
              <ul className="domain-topics">
                {d.topics.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
              <div className="domain-actions">
                <button className="btn-sm" onClick={() => nav(`/academy/scenario?domain=${d.id}`)}>
                  Practice Scenario
                </button>
                <button className="btn-sm btn-outline" onClick={() => nav(`/academy/quiz?domain=${d.id}`)}>
                  Take Quiz
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Certification tiers */}
      {activeTab === 'tiers' && (
        <div className="tiers-grid">
          {TIERS.map(t => (
            <div key={t.key} className="tier-card" style={{ '--tier-color': t.color }}>
              <div className="tier-badge" style={{ background: t.color }}>{t.key}</div>
              <h3>{t.name}</h3>
              <div className="tier-level">{t.level} Shield</div>
              <div className="tier-desc">
                {t.key === 'KCM' && '40 hours + 10-hour practicum. Entry-level credential for supervised visitation monitors.'}
                {t.key === 'KACM' && '20 additional advanced hours. Requires 2 years / 500+ hours experience + active KCM.'}
                {t.key === 'KMM' && '30 additional hours. Master-level credential for program directors and lead monitors.'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
