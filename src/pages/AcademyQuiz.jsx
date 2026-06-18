import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { callLLM, parseLLMJson, DOMAINS } from '../lib/academy'
import '../components/academy.css'

/**
 * KaNun Academy — Practice Assessment
 * AI-generated adaptive practice questions.
 */
export default function AcademyQuiz() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const initDomain = params.get('domain') ? parseInt(params.get('domain')) : null

  const [domain, setDomain] = useState(initDomain)
  const [difficulty, setDifficulty] = useState('medium')
  const [count, setCount] = useState(5)
  const [questions, setQuestions] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selected, setSelected] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [quizComplete, setQuizComplete] = useState(false)

  const current = questions[currentIdx] || null

  async function startQuiz() {
    setLoading(true)
    setError(null)
    setQuestions([])
    setCurrentIdx(0)
    setSelected(null)
    setAnswered(false)
    setResults([])
    setQuizComplete(false)

    try {
      const res = await callLLM({
        mode: 'quiz',
        domain: domain || undefined,
        difficulty,
        count,
        bloomsLevel: '3-5',
      })
      const parsed = parseLLMJson(res.content)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('No questions generated. Try again.')
      }
      setQuestions(parsed)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function selectAnswer(idx) {
    if (answered) return
    setSelected(idx)
  }

  function submitAnswer() {
    if (selected === null) return
    setAnswered(true)
    const correct = selected === current.correctIndex
    setResults(prev => [...prev, { questionId: current.id, correct, selected, correctIndex: current.correctIndex }])
  }

  function nextQuestion() {
    if (currentIdx + 1 >= questions.length) {
      setQuizComplete(true)
    } else {
      setCurrentIdx(prev => prev + 1)
      setSelected(null)
      setAnswered(false)
    }
  }

  const correctCount = results.filter(r => r.correct).length
  const totalAnswered = results.length
  const pct = totalAnswered > 0 ? Math.round(correctCount / totalAnswered * 100) : 0

  return (
    <div className="academy-page">
      <div className="page-header">
        <button className="back-link" onClick={() => nav('/academy')}>← Back to Academy</button>
        <h1>📝 Practice Assessment</h1>
        <p>AI-generated practice questions mapped to the KaNun competency framework. Test your knowledge across all five domains.</p>
      </div>

      {/* Config — before quiz starts */}
      {questions.length === 0 && !loading && (
        <div className="quiz-config">
          <div className="config-row">
            <div className="config-field">
              <label>Domain</label>
              <select value={domain || ''} onChange={e => setDomain(e.target.value ? parseInt(e.target.value) : null)}>
                <option value="">All Domains</option>
                {DOMAINS.map(d => <option key={d.id} value={d.id}>{d.icon} {d.short}</option>)}
              </select>
            </div>
            <div className="config-field">
              <label>Difficulty</label>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className="config-field">
              <label>Questions</label>
              <select value={count} onChange={e => setCount(parseInt(e.target.value))}>
                <option value={3}>3 questions</option>
                <option value={5}>5 questions</option>
                <option value={10}>10 questions</option>
              </select>
            </div>
          </div>
          <button className="btn-primary btn-lg" onClick={startQuiz}>
            🚀 Start Practice Quiz
          </button>
        </div>
      )}

      {loading && (
        <div className="quiz-loading">
          <div className="spinner" />
          <p>Generating questions…</p>
        </div>
      )}

      {error && <div className="academy-error">{error}</div>}

      {/* Active question */}
      {current && !quizComplete && (
        <div className="quiz-active">
          <div className="quiz-progress-bar">
            <div className="quiz-progress-fill" style={{ width: `${(currentIdx + 1) / questions.length * 100}%` }} />
          </div>
          <div className="quiz-meta">
            <span>Question {currentIdx + 1} of {questions.length}</span>
            <span className="quiz-score-live">{correctCount}/{totalAnswered} correct</span>
            {current.domain && <span className="quiz-domain-tag">{DOMAINS[current.domain - 1]?.icon} {DOMAINS[current.domain - 1]?.short}</span>}
          </div>

          <div className="question-card">
            <p className="question-text">{current.question}</p>

            <div className="options-list">
              {current.options?.map((opt, i) => {
                let cls = 'option-btn'
                if (answered) {
                  if (i === current.correctIndex) cls += ' correct'
                  else if (i === selected) cls += ' incorrect'
                } else if (i === selected) {
                  cls += ' selected'
                }
                return (
                  <button key={i} className={cls} onClick={() => selectAnswer(i)} disabled={answered}>
                    <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                    <span className="option-text">{opt}</span>
                    {answered && i === current.correctIndex && <span className="option-check">✓</span>}
                    {answered && i === selected && i !== current.correctIndex && <span className="option-x">✗</span>}
                  </button>
                )
              })}
            </div>

            {!answered ? (
              <button className="btn-primary" onClick={submitAnswer} disabled={selected === null}>
                Check Answer
              </button>
            ) : (
              <div className="answer-feedback">
                <div className={`feedback-banner ${selected === current.correctIndex ? 'correct' : 'incorrect'}`}>
                  {selected === current.correctIndex ? '✓ Correct!' : '✗ Incorrect'}
                </div>
                {current.explanation && (
                  <div className="explanation">
                    <strong>Explanation:</strong> {current.explanation}
                  </div>
                )}
                <button className="btn-primary" onClick={nextQuestion}>
                  {currentIdx + 1 >= questions.length ? 'See Results' : 'Next Question →'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quiz complete */}
      {quizComplete && (
        <div className="quiz-results">
          <div className="results-hero">
            <div className={`results-score ${pct >= 70 ? 'pass' : 'fail'}`}>
              <div className="results-pct">{pct}%</div>
              <div className="results-fraction">{correctCount} / {totalAnswered}</div>
            </div>
            <h2>{pct >= 70 ? '🎉 Great work!' : '📚 Keep practicing!'}</h2>
            <p>
              {pct >= 70
                ? 'You\'re showing strong competency in this area. Keep building on this foundation.'
                : 'Review the explanations above and try the AI Tutor for deeper learning on areas you missed.'}
            </p>
          </div>

          <div className="results-actions">
            <button className="btn-primary" onClick={() => { setQuestions([]); setQuizComplete(false) }}>
              Take Another Quiz
            </button>
            <button className="btn-outline" onClick={() => nav('/academy/tutor')}>
              Ask AI Tutor
            </button>
            <button className="btn-outline" onClick={() => nav('/academy')}>
              Back to Academy
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
