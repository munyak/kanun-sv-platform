import React, { useState, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { callLLM, parseLLMJson, DOMAINS } from '../lib/academy'
import '../components/academy.css'

/**
 * KaNun Academy — AI Scenario Simulator
 * Immersive SV scenario training with LLM evaluation.
 */
export default function AcademyScenario() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const initDomain = params.get('domain') ? parseInt(params.get('domain')) : null

  const [domain, setDomain] = useState(initDomain)
  const [difficulty, setDifficulty] = useState('moderate')
  const [scenario, setScenario] = useState(null)
  const [evaluation, setEvaluation] = useState(null)
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([]) // conversation history for follow-ups
  const textareaRef = useRef(null)
  const resultRef = useRef(null)

  async function generateScenario() {
    setLoading(true)
    setError(null)
    setScenario(null)
    setEvaluation(null)
    setResponse('')
    setHistory([])

    try {
      const res = await callLLM({ mode: 'scenario', domain, difficulty })
      const parsed = parseLLMJson(res.content)
      setScenario(parsed)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function submitResponse() {
    if (!response.trim()) return
    setLoading(true)
    setError(null)
    setEvaluation(null)

    const msgs = [
      ...history,
      {
        role: 'assistant',
        content: JSON.stringify(scenario),
      },
      {
        role: 'user',
        content: `Here is my response as the monitor:\n\n${response}\n\nPlease evaluate my response. Return ONLY the JSON evaluation object.`,
      },
    ]

    try {
      const res = await callLLM({ mode: 'scenario', messages: msgs })
      const parsed = parseLLMJson(res.content)
      setEvaluation(parsed)
      setHistory(msgs)
      // Scroll to results
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function scoreColor(score) {
    if (score >= 3.5) return 'var(--success)'
    if (score >= 2.5) return 'var(--warning)'
    return 'var(--error)'
  }

  return (
    <div className="academy-page">
      <div className="page-header">
        <button className="back-link" onClick={() => nav('/academy')}>← Back to Academy</button>
        <h1>🎭 AI Scenario Simulator</h1>
        <p>Practice real-world supervised visitation scenarios. The AI will evaluate your response on safety, boundaries, documentation, and de-escalation.</p>
      </div>

      {/* Config bar */}
      <div className="scenario-config">
        <div className="config-field">
          <label>Domain</label>
          <select value={domain || ''} onChange={e => setDomain(e.target.value ? parseInt(e.target.value) : null)}>
            <option value="">Random</option>
            {DOMAINS.map(d => <option key={d.id} value={d.id}>{d.icon} {d.short}</option>)}
          </select>
        </div>
        <div className="config-field">
          <label>Difficulty</label>
          <select value={difficulty} onChange={e => setDifficulty(e.target.value)}>
            <option value="easy">Easy — Straightforward situation</option>
            <option value="moderate">Moderate — Multiple considerations</option>
            <option value="hard">Hard — Complex, multi-factor case</option>
          </select>
        </div>
        <button className="btn-primary" onClick={generateScenario} disabled={loading}>
          {loading && !scenario ? 'Generating…' : '🎲 Generate Scenario'}
        </button>
      </div>

      {error && <div className="academy-error">{error}</div>}

      {/* Scenario display */}
      {scenario && (
        <div className="scenario-card">
          <div className="scenario-header">
            <h2>{scenario.title}</h2>
            {domain && <span className="scenario-domain">{DOMAINS.find(d => d.id === domain)?.icon} {DOMAINS.find(d => d.id === domain)?.short}</span>}
          </div>

          <div className="scenario-section">
            <h4>Setting</h4>
            <p>{scenario.setting}</p>
          </div>

          <div className="scenario-section">
            <h4>Background</h4>
            <p>{scenario.background}</p>
          </div>

          <div className="scenario-section scenario-situation">
            <h4>⚠️ The Situation</h4>
            <p>{scenario.situation}</p>
          </div>

          <div className="scenario-prompt">
            <strong>{scenario.question || 'As the monitor, what do you do?'}</strong>
          </div>

          {/* Response input */}
          <div className="response-area">
            <textarea
              ref={textareaRef}
              value={response}
              onChange={e => setResponse(e.target.value)}
              placeholder="Describe what you would do as the monitor. Be specific about your actions, what you would document, and how you would handle the situation…"
              rows={6}
              disabled={loading}
            />
            <div className="response-footer">
              <span className="char-count">{response.length} characters</span>
              <button className="btn-primary" onClick={submitResponse} disabled={loading || !response.trim()}>
                {loading ? 'Evaluating…' : '📊 Submit for Evaluation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evaluation results */}
      {evaluation && (
        <div className="evaluation-card" ref={resultRef}>
          <h3>📊 Evaluation Results</h3>

          <div className="score-grid">
            {[
              { key: 'safety', label: 'Safety Awareness', icon: '🛡️' },
              { key: 'boundaries', label: 'Professional Boundaries', icon: '🤝' },
              { key: 'documentation', label: 'Documentation Instinct', icon: '📋' },
              { key: 'deescalation', label: 'De-escalation', icon: '🕊️' },
            ].map(axis => (
              <div key={axis.key} className="score-item">
                <div className="score-label">{axis.icon} {axis.label}</div>
                <div className="score-bar">
                  <div
                    className="score-fill"
                    style={{
                      width: `${(evaluation.scores?.[axis.key] || 0) / 4 * 100}%`,
                      background: scoreColor(evaluation.scores?.[axis.key] || 0),
                    }}
                  />
                </div>
                <div className="score-num" style={{ color: scoreColor(evaluation.scores?.[axis.key] || 0) }}>
                  {evaluation.scores?.[axis.key]?.toFixed(1) || '–'} / 4.0
                </div>
              </div>
            ))}
          </div>

          <div className="overall-score" style={{ borderColor: scoreColor(evaluation.overall || 0) }}>
            <span>Overall Score</span>
            <strong style={{ color: scoreColor(evaluation.overall || 0) }}>
              {evaluation.overall?.toFixed(1) || '–'} / 4.0
            </strong>
            {evaluation.overall >= 3.0
              ? <span className="pass-badge">✓ Passing</span>
              : <span className="fail-badge">Needs improvement</span>}
          </div>

          <div className="feedback-section">
            <h4>Feedback</h4>
            <p>{evaluation.feedback}</p>
          </div>

          {evaluation.followUp && (
            <div className="feedback-section followup">
              <h4>💡 Consider This</h4>
              <p>{evaluation.followUp}</p>
            </div>
          )}

          <div className="eval-actions">
            <button className="btn-primary" onClick={generateScenario}>Try Another Scenario</button>
            <button className="btn-outline" onClick={() => { setResponse(''); setEvaluation(null); textareaRef.current?.focus() }}>
              Retry This Scenario
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
