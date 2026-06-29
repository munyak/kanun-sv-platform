import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { DOMAINS, TOTAL_HOURS, TIERS, getAllTopics } from '../lib/academy'
import '../components/academy.css'

/**
 * KaNun Academy — Main dashboard
 * Shows enrollment, progress tracking, competency domains with lessons,
 * and entry points to AI tools (Scenario, Tutor, Quiz).
 */
export default function Academy() {
  const nav = useNavigate()
  const [activeTab, setActiveTab] = useState('learn')
  const [enrolled, setEnrolled] = useState(() => localStorage.getItem('academy_enrolled') || null)
  const [progress, setProgress] = useState({})

  // Calculate progress from localStorage
  useEffect(() => {
    const p = {};
    DOMAINS.forEach((d) => {
      const completed = d.topics.filter(
        (_, i) => localStorage.getItem(`lesson_${d.id}_${i}`) === 'done'
      ).length;
      p[d.id] = { completed, total: d.topics.length, pct: Math.round((completed / d.topics.length) * 100) };
    });
    setProgress(p);
  }, []);

  const totalLessonsCompleted = Object.values(progress).reduce((s, p) => s + p.completed, 0);
  const totalLessons = Object.values(progress).reduce((s, p) => s + p.total, 0);
  const overallPct = totalLessons > 0 ? Math.round((totalLessonsCompleted / totalLessons) * 100) : 0;

  function handleEnroll(tierKey) {
    localStorage.setItem('academy_enrolled', tierKey);
    setEnrolled(tierKey);
  }

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
          {enrolled ? (
            <div className="academy-hero-stats">
              <div className="stat-pill enrolled-stat">
                <span className="stat-num">{overallPct}%</span> Complete
              </div>
              <div className="stat-pill">
                <span className="stat-num">{totalLessonsCompleted}/{totalLessons}</span> Lessons
              </div>
              <div className="stat-pill enrolled-tier">
                <span className="stat-num">{enrolled}</span> Track
              </div>
            </div>
          ) : (
            <div className="academy-hero-stats">
              <div className="stat-pill"><span className="stat-num">{DOMAINS.length}</span> Domains</div>
              <div className="stat-pill"><span className="stat-num">{TOTAL_HOURS}</span> Hours</div>
              <div className="stat-pill"><span className="stat-num">3</span> Certification Tiers</div>
            </div>
          )}
        </div>
      </div>

      {/* Enrollment banner if not enrolled */}
      {!enrolled && (
        <div className="enrollment-banner">
          <div className="enrollment-text">
            <h2>Start Your Certification Journey</h2>
            <p>Choose a certification tier to begin your structured learning path with AI-generated lessons, practice scenarios, and assessments.</p>
          </div>
          <div className="enrollment-tiers">
            {TIERS.map((t) => (
              <button key={t.key} className="enroll-tier-btn" style={{ '--tier-color': t.color }} onClick={() => handleEnroll(t.key)}>
                <span className="enroll-tier-badge" style={{ background: t.color }}>{t.key}</span>
                <span className="enroll-tier-name">{t.name}</span>
                <span className="enroll-cta">Enroll →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Progress dashboard (when enrolled) */}
      {enrolled && (
        <div className="progress-dashboard">
          <div className="progress-bar-overall">
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${overallPct}%` }} />
            </div>
            <span className="progress-bar-label">{overallPct}% of lessons completed</span>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="academy-tabs">
        <button className={`tab-btn ${activeTab === 'learn' ? 'active' : ''}`} onClick={() => setActiveTab('learn')}>
          Learning Path
        </button>
        <button className={`tab-btn ${activeTab === 'practice' ? 'active' : ''}`} onClick={() => setActiveTab('practice')}>
          Practice Tools
        </button>
        <button className={`tab-btn ${activeTab === 'tiers' ? 'active' : ''}`} onClick={() => setActiveTab('tiers')}>
          Certification Tiers
        </button>
      </div>

      {/* Learning Path — domain cards with lesson links */}
      {activeTab === 'learn' && (
        <div className="learning-path">
          {DOMAINS.map((d) => {
            const dp = progress[d.id] || { completed: 0, total: d.topics.length, pct: 0 };
            return (
              <div key={d.id} className="domain-learn-card" style={{ '--domain-color': d.color }}>
                <div className="domain-learn-header">
                  <div className="domain-learn-title">
                    <span className="domain-icon">{d.icon}</span>
                    <div>
                      <h3>{d.name}</h3>
                      <span className="domain-meta">{d.hours} hours · {d.weight} of exam</span>
                    </div>
                  </div>
                  <div className="domain-learn-progress">
                    <span className="domain-pct">{dp.pct}%</span>
                    <div className="domain-progress-ring">
                      <svg viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#eee" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke={d.color} strokeWidth="3"
                          strokeDasharray={`${dp.pct} ${100 - dp.pct}`} strokeDashoffset="25"
                          strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="domain-topic-list">
                  {d.topics.map((t, i) => {
                    const isDone = localStorage.getItem(`lesson_${d.id}_${i}`) === 'done';
                    return (
                      <Link
                        key={i}
                        to={`/academy/lesson?domain=${d.id}&topic=${i}`}
                        className={`topic-lesson-link ${isDone ? 'done' : ''}`}
                      >
                        <span className="topic-status">
                          {isDone ? '✓' : (i + 1)}
                        </span>
                        <span className="topic-name">{t}</span>
                        <span className="topic-action">{isDone ? 'Review' : 'Start Lesson'} →</span>
                      </Link>
                    );
                  })}
                </div>
                <div className="domain-learn-footer">
                  <Link className="btn-sm" to={`/academy/quiz?domain=${d.id}`}>Take Domain Quiz</Link>
                  <Link className="btn-sm btn-outline" to={`/academy/scenario?domain=${d.id}`}>Practice Scenario</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Practice Tools */}
      {activeTab === 'practice' && (
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
              {enrolled === t.key ? (
                <div className="tier-enrolled">✓ Currently Enrolled</div>
              ) : (
                <button className="btn-sm" onClick={() => handleEnroll(t.key)}>
                  {enrolled ? 'Switch to This Tier' : 'Enroll'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
