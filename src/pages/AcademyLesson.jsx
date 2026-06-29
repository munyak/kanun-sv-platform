import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { callLLM, parseLLMJson, DOMAINS } from '../lib/academy';
import { renderInteractive } from '../components/InteractiveLessonElements';
import { VideoSection } from '../components/VideoLesson';
import '../components/academy.css';

/**
 * Try loading a pre-generated lesson from /lessons/domain-{id}-topic-{idx}.json.
 * Falls back to LLM generation if no static file exists.
 */
async function fetchLesson(domainId, topicIdx, topicName) {
  // 1. Try static file first (instant, no timeout risk)
  try {
    const staticUrl = `/lessons/domain-${domainId}-topic-${topicIdx}.json`;
    const resp = await fetch(staticUrl);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.sections && data.sections.length > 0) {
        return data;
      }
    }
  } catch {
    // Static file doesn't exist — fall through to LLM
  }

  // 2. Fall back to LLM generation
  const res = await callLLM({ mode: 'lesson', domain: domainId, topic: topicName });
  return parseLLMJson(res.content);
}

export default function AcademyLesson() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const domainId = Number(params.get('domain')) || 1;
  const topicIdx = Number(params.get('topic')) || 0;

  const domain = DOMAINS.find((d) => d.id === domainId) || DOMAINS[0];
  const topicName = domain.topics[topicIdx] || domain.topics[0];

  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState(0);
  const [completed, setCompleted] = useState(() => {
    const key = `lesson_${domainId}_${topicIdx}`;
    return localStorage.getItem(key) === 'done';
  });

  // Feedback state (for reviewers like Jeneve)
  const [feedbackOpen, setFeedbackOpen] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackRating, setFeedbackRating] = useState(null);
  const [submittedFeedback, setSubmittedFeedback] = useState({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLesson(null);
    setActiveSection(0);

    fetchLesson(domainId, topicIdx, topicName)
      .then((data) => {
        if (cancelled) return;
        setLesson(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [domainId, topicIdx, topicName]);

  function handleComplete() {
    const key = `lesson_${domainId}_${topicIdx}`;
    localStorage.setItem(key, 'done');
    setCompleted(true);
  }

  function handleFeedbackSubmit(sectionId) {
    const fb = JSON.parse(localStorage.getItem('lesson_feedback') || '{}');
    const key = `${domainId}_${topicIdx}_${sectionId}`;
    fb[key] = { rating: feedbackRating, comment: feedbackText, ts: Date.now() };
    localStorage.setItem('lesson_feedback', JSON.stringify(fb));
    setSubmittedFeedback((prev) => ({ ...prev, [sectionId]: true }));
    setFeedbackOpen(null);
    setFeedbackText('');
    setFeedbackRating(null);
  }

  const hasNext = topicIdx < domain.topics.length - 1;

  if (loading) {
    return (
      <div className="academy-page">
        <button className="back-link" onClick={() => navigate('/academy')}>← Academy</button>
        <div className="lesson-loading">
          <div className="lesson-loading-spinner" />
          <h2>Loading lesson...</h2>
          <p>Preparing <strong>{topicName}</strong></p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="academy-page">
        <button className="back-link" onClick={() => navigate('/academy')}>← Academy</button>
        <div className="lesson-error">
          <h2>Could not load lesson</h2>
          <p>{error}</p>
          <button className="btn-primary" onClick={() => window.location.reload()}>Try Again</button>
        </div>
      </div>
    );
  }

  if (!lesson) return null;

  const sections = lesson.sections || [];
  const currentSection = sections[activeSection];

  return (
    <div className="academy-page lesson-page">
      <button className="back-link" onClick={() => navigate('/academy')}>← Academy</button>

      {/* Lesson header */}
      <div className="lesson-header" style={{ borderLeftColor: domain.color }}>
        <div className="lesson-header-meta">
          <span className="lesson-domain-badge" style={{ background: domain.color }}>
            {domain.icon} {domain.short}
          </span>
          {lesson.estimatedMinutes && (
            <span className="lesson-time">~{lesson.estimatedMinutes} min</span>
          )}
          {completed && <span className="lesson-complete-badge">✓ Completed</span>}
        </div>
        <h1>{lesson.title}</h1>
        <p className="lesson-summary">{lesson.summary}</p>
      </div>

      {/* Section navigation */}
      <div className="lesson-layout">
        <nav className="lesson-sidebar">
          <div className="lesson-sidebar-title">Sections</div>
          {sections.map((s, i) => (
            <button
              key={s.id}
              className={`lesson-nav-item ${i === activeSection ? 'active' : ''}`}
              onClick={() => setActiveSection(i)}
            >
              <span className="lesson-nav-num">{i + 1}</span>
              <span className="lesson-nav-label">{s.title}</span>
            </button>
          ))}
        </nav>

        {/* Section content */}
        <div className="lesson-content">
          {currentSection && (
            <article className="lesson-section">
              <div className="lesson-section-header">
                <span className="lesson-section-type">{formatType(currentSection.type)}</span>
                <h2>{currentSection.title}</h2>
              </div>

              {/* Training video — only when the section actually has one, so
                  text-only lessons don't show a "coming soon" card per section. */}
              {(currentSection.videoId || currentSection.directVideoUrl) && (
                <VideoSection
                  sectionKey={`d${domainId}-t${topicIdx}-${currentSection.id}`}
                  sectionTitle={currentSection.title}
                  sectionContent={currentSection.content}
                  isAdmin={true}
                  presetVideoId={currentSection.videoId}
                  directVideoUrl={currentSection.directVideoUrl}
                />
              )}

              {currentSection.content && (
                <div className="lesson-section-body">
                  {currentSection.content.split('\n\n').map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              )}

              {currentSection.keyPoints && currentSection.keyPoints.length > 0 && (
                <div className="lesson-key-points">
                  <h3>Key Takeaways</h3>
                  <ul>
                    {currentSection.keyPoints.map((kp, i) => (
                      <li key={i}>{kp}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Interactive elements */}
              {currentSection.interactive && currentSection.interactive.length > 0 && (
                <div className="lesson-interactive-zone">
                  {currentSection.interactive.map((item, idx) => renderInteractive(item, idx))}
                </div>
              )}

              {currentSection.discussion && currentSection.discussion.length > 0 && (
                <div className="lesson-discussion">
                  <h3>Discussion Questions</h3>
                  <ol>
                    {currentSection.discussion.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ol>
                </div>
              )}

              {currentSection.questions && currentSection.questions.length > 0 && (
                <div className="lesson-reflection">
                  <h3>Reflect on These Questions</h3>
                  <ol>
                    {currentSection.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Feedback panel for reviewers */}
              <div className="lesson-feedback-zone">
                {submittedFeedback[currentSection.id] ? (
                  <div className="feedback-submitted">✓ Feedback submitted for this section</div>
                ) : feedbackOpen === currentSection.id ? (
                  <div className="feedback-form">
                    <h4>Content Feedback</h4>
                    <p className="feedback-hint">Rate and comment on this section to help improve the curriculum.</p>
                    <div className="feedback-rating">
                      {['Needs Work', 'Acceptable', 'Good', 'Excellent'].map((label, i) => (
                        <button
                          key={i}
                          className={`feedback-rating-btn ${feedbackRating === i + 1 ? 'active' : ''}`}
                          onClick={() => setFeedbackRating(i + 1)}
                        >
                          {i + 1} — {label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="feedback-textarea"
                      rows={3}
                      placeholder="What should be changed, added, or removed? Be specific..."
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                    />
                    <div className="feedback-actions">
                      <button className="btn-outline btn-sm" onClick={() => setFeedbackOpen(null)}>Cancel</button>
                      <button
                        className="btn-primary btn-sm"
                        disabled={!feedbackRating}
                        onClick={() => handleFeedbackSubmit(currentSection.id)}
                      >
                        Submit Feedback
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn-outline btn-sm feedback-trigger"
                    onClick={() => setFeedbackOpen(currentSection.id)}
                  >
                    📝 Leave Feedback on This Section
                  </button>
                )}
              </div>

              {/* Section navigation */}
              <div className="lesson-section-nav">
                {activeSection > 0 && (
                  <button className="btn-outline" onClick={() => setActiveSection(activeSection - 1)}>
                    ← Previous
                  </button>
                )}
                <div className="lesson-section-counter">
                  {activeSection + 1} of {sections.length}
                </div>
                {activeSection < sections.length - 1 ? (
                  <button className="btn-primary" onClick={() => setActiveSection(activeSection + 1)}>
                    Next →
                  </button>
                ) : !completed ? (
                  <button className="btn-primary btn-lg" onClick={handleComplete}>
                    ✓ Mark Lesson Complete
                  </button>
                ) : (
                  <div className="lesson-done-actions">
                    {hasNext && (
                      <Link
                        className="btn-primary"
                        to={`/academy/lesson?domain=${domainId}&topic=${topicIdx + 1}`}
                      >
                        Next Lesson →
                      </Link>
                    )}
                    <Link className="btn-outline" to={`/academy/quiz?domain=${domainId}`}>
                      Take Quiz →
                    </Link>
                  </div>
                )}
              </div>
            </article>
          )}
        </div>
      </div>

      {/* Topic navigation footer */}
      <div className="lesson-topic-nav">
        <h3>Topics in {domain.short}</h3>
        <div className="lesson-topic-list">
          {domain.topics.map((t, i) => {
            const isDone = localStorage.getItem(`lesson_${domainId}_${i}`) === 'done';
            return (
              <Link
                key={i}
                to={`/academy/lesson?domain=${domainId}&topic=${i}`}
                className={`lesson-topic-pill ${i === topicIdx ? 'current' : ''} ${isDone ? 'done' : ''}`}
              >
                {isDone && <span className="topic-check">✓</span>}
                {t}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatType(type) {
  const map = {
    overview: 'Overview',
    concepts: 'Core Concepts',
    examples: 'Examples',
    case_study: 'Case Study',
    best_practices: 'Best Practices',
    reflection: 'Reflection',
  };
  return map[type] || type;
}
