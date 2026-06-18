import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callLLM, DOMAINS } from '../lib/academy'
import '../components/academy.css'

/**
 * KaNun Academy — AI Tutor (Socratic Method)
 * On-demand learning coach that guides through questions rather than answers.
 */
export default function AcademyTutor() {
  const nav = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const chatEndRef = useRef(null)
  const inputRef = useRef(null)

  // Suggested conversation starters
  const starters = [
    { text: 'What are my mandated reporting obligations as a monitor?', domain: 1 },
    { text: 'How do I recognize signs of parental substance abuse during a visit?', domain: 3 },
    { text: 'Walk me through how to write a court-ready visit report.', domain: 4 },
    { text: 'What should I do if a child makes a disclosure during a visit?', domain: 2 },
    { text: 'How do I de-escalate when a parent becomes aggressive at a custody exchange?', domain: 5 },
    { text: 'Explain the difference between observation and interpretation in documentation.', domain: 4 },
  ]

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text) {
    const userMsg = text || input.trim()
    if (!userMsg) return

    const newMessages = [...messages, { role: 'user', content: userMsg }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      // Send conversation history to LLM
      const res = await callLLM({
        mode: 'tutor',
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
      })
      setMessages(prev => [...prev, { role: 'assistant', content: res.content }])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function clearChat() {
    setMessages([])
    setError(null)
  }

  return (
    <div className="academy-page tutor-page">
      <div className="page-header">
        <button className="back-link" onClick={() => nav('/academy')}>← Back to Academy</button>
        <h1>🧠 AI Tutor</h1>
        <p>Your Socratic learning coach. Ask any question about supervised visitation — the tutor will guide you to the answer through thoughtful questions.</p>
      </div>

      <div className="tutor-layout">
        {/* Chat area */}
        <div className="chat-container">
          {messages.length === 0 && (
            <div className="chat-empty">
              <div className="chat-empty-icon">🧠</div>
              <h3>Start a conversation</h3>
              <p>Ask me anything about supervised visitation monitoring. I'll guide you with questions, not just answers.</p>
              <div className="starter-grid">
                {starters.map((s, i) => (
                  <button key={i} className="starter-btn" onClick={() => sendMessage(s.text)}>
                    <span className="starter-domain">{DOMAINS[s.domain - 1]?.icon}</span>
                    <span>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.role}`}>
                <div className="msg-avatar">
                  {msg.role === 'user' ? '👤' : '🧠'}
                </div>
                <div className="msg-bubble">
                  <div className="msg-role">{msg.role === 'user' ? 'You' : 'KaNun AI Tutor'}</div>
                  <div className="msg-text">{msg.content}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="chat-msg assistant">
                <div className="msg-avatar">🧠</div>
                <div className="msg-bubble">
                  <div className="msg-role">KaNun AI Tutor</div>
                  <div className="msg-text typing">
                    <span className="dot" /><span className="dot" /><span className="dot" />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {error && <div className="academy-error">{error}</div>}

          {/* Input */}
          <div className="chat-input-bar">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about supervised visitation…"
              rows={2}
              disabled={loading}
            />
            <button className="btn-send" onClick={() => sendMessage()} disabled={loading || !input.trim()}>
              {loading ? '…' : '↑'}
            </button>
          </div>

          {messages.length > 0 && (
            <button className="btn-clear" onClick={clearChat}>Clear conversation</button>
          )}
        </div>

        {/* Sidebar — domain quick-reference */}
        <aside className="tutor-sidebar">
          <h4>📚 Competency Domains</h4>
          {DOMAINS.map(d => (
            <div key={d.id} className="sidebar-domain">
              <span className="sidebar-icon">{d.icon}</span>
              <div>
                <div className="sidebar-domain-name">{d.short}</div>
                <div className="sidebar-domain-weight">{d.weight} · {d.hours}h</div>
              </div>
            </div>
          ))}
          <div className="sidebar-tip">
            <strong>💡 Tip:</strong> Ask about specific topics within any domain for deeper learning. The tutor will guide you with questions, not lecture you.
          </div>
        </aside>
      </div>
    </div>
  )
}
