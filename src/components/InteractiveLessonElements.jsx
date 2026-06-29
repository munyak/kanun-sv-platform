import { useState } from 'react';
import './interactive-lessons.css';

/* ─── Knowledge Check (inline quiz) ─── */
export function KnowledgeCheck({ question, options, correctIndex, explanation }) {
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);

  function handleSelect(idx) {
    if (revealed) return;
    setSelected(idx);
  }

  function handleCheck() {
    setRevealed(true);
  }

  const isCorrect = selected === correctIndex;

  return (
    <div className="ix-knowledge-check">
      <div className="ix-kc-header">
        <span className="ix-kc-icon">✦</span>
        <span className="ix-kc-label">Knowledge Check</span>
      </div>
      <p className="ix-kc-question">{question}</p>
      <div className="ix-kc-options">
        {options.map((opt, i) => (
          <button
            key={i}
            className={`ix-kc-opt ${selected === i ? 'selected' : ''} ${
              revealed ? (i === correctIndex ? 'correct' : selected === i ? 'wrong' : '') : ''
            }`}
            onClick={() => handleSelect(i)}
          >
            <span className="ix-kc-opt-letter">{String.fromCharCode(65 + i)}</span>
            <span className="ix-kc-opt-text">{opt}</span>
            {revealed && i === correctIndex && <span className="ix-kc-check">✓</span>}
            {revealed && selected === i && i !== correctIndex && <span className="ix-kc-x">✗</span>}
          </button>
        ))}
      </div>
      {!revealed && selected !== null && (
        <button className="ix-kc-submit" onClick={handleCheck}>Check Answer</button>
      )}
      {revealed && (
        <div className={`ix-kc-result ${isCorrect ? 'correct' : 'wrong'}`}>
          <strong>{isCorrect ? 'Correct!' : 'Not quite.'}</strong>
          <p>{explanation}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Click-to-Reveal Scenario ─── */
export function ScenarioReveal({ scenario, response, followUp }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="ix-scenario">
      <div className="ix-scenario-header">
        <span className="ix-scenario-icon">📋</span>
        <span className="ix-scenario-label">Interactive Scenario</span>
      </div>
      <div className="ix-scenario-text">{scenario}</div>
      {!revealed ? (
        <button className="ix-scenario-reveal-btn" onClick={() => setRevealed(true)}>
          What should you do? Click to see the recommended response →
        </button>
      ) : (
        <div className="ix-scenario-answer">
          <div className="ix-scenario-answer-header">Recommended Response</div>
          <p>{response}</p>
          {followUp && <p className="ix-scenario-followup"><strong>Key Takeaway:</strong> {followUp}</p>}
        </div>
      )}
    </div>
  );
}

/* ─── Step-by-Step Walkthrough ─── */
export function StepByStep({ title, steps }) {
  const [currentStep, setCurrentStep] = useState(0);
  return (
    <div className="ix-steps">
      <div className="ix-steps-header">
        <span className="ix-steps-icon">📍</span>
        <span className="ix-steps-title">{title}</span>
      </div>
      <div className="ix-steps-track">
        {steps.map((s, i) => (
          <div key={i} className={`ix-step-dot ${i <= currentStep ? 'active' : ''} ${i === currentStep ? 'current' : ''}`}>
            <button onClick={() => setCurrentStep(i)}>{i + 1}</button>
          </div>
        ))}
        <div className="ix-step-line" style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }} />
      </div>
      <div className="ix-step-content">
        <h4>{steps[currentStep].title}</h4>
        <p>{steps[currentStep].content}</p>
        {steps[currentStep].tip && (
          <div className="ix-step-tip">💡 {steps[currentStep].tip}</div>
        )}
      </div>
      <div className="ix-step-nav">
        <button disabled={currentStep === 0} onClick={() => setCurrentStep(currentStep - 1)}>← Back</button>
        <span>{currentStep + 1} / {steps.length}</span>
        <button disabled={currentStep === steps.length - 1} onClick={() => setCurrentStep(currentStep + 1)}>Next →</button>
      </div>
    </div>
  );
}

/* ─── Interactive SVG Diagram ─── */
export function InteractiveDiagram({ diagramId, title }) {
  const diagrams = {
    'court-order-types': CourtOrderDiagram,
    'safe-model': SAFEModelDiagram,
    'calm-method': CALMMethodDiagram,
    'reporting-flow': ReportingFlowDiagram,
    'visit-workflow': VisitWorkflowDiagram,
  };
  const DiagramComponent = diagrams[diagramId];
  if (!DiagramComponent) return null;
  return (
    <div className="ix-diagram">
      <div className="ix-diagram-header">
        <span className="ix-diagram-icon">📊</span>
        <span className="ix-diagram-title">{title}</span>
      </div>
      <DiagramComponent />
    </div>
  );
}

/* ─── Court Order Types Diagram ─── */
function CourtOrderDiagram() {
  const [active, setActive] = useState(null);
  const items = [
    { id: 'exparte', label: 'Ex Parte\n(Emergency)', color: '#C43025', x: 120, desc: 'Issued quickly without both parties present. Indicates immediate safety concern — heightened vigilance required.' },
    { id: 'pendente', label: 'Pendente Lite\n(Pending)', color: '#C6860A', x: 330, desc: 'Issued while case is pending after hearing. Both parties present. More detailed visit conditions.' },
    { id: 'final', label: 'Final\n(Permanent)', color: '#2E7D4F', x: 540, desc: 'Issued after trial or stipulation. May include pathway to unsupervised visits if conditions are met.' },
  ];
  return (
    <div className="ix-svg-wrap">
      <svg viewBox="0 0 660 260" className="ix-svg">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#888" />
          </marker>
        </defs>
        <text x="330" y="28" textAnchor="middle" className="ix-svg-title">Types of Court Orders</text>
        <line x1="160" y1="80" x2="310" y2="80" stroke="#888" strokeWidth="2" markerEnd="url(#arrow)" />
        <line x1="370" y1="80" x2="520" y2="80" stroke="#888" strokeWidth="2" markerEnd="url(#arrow)" />
        <text x="235" y="72" textAnchor="middle" className="ix-svg-small">escalates to</text>
        <text x="445" y="72" textAnchor="middle" className="ix-svg-small">resolves as</text>
        {items.map((item) => (
          <g key={item.id} onClick={() => setActive(active === item.id ? null : item.id)} style={{ cursor: 'pointer' }}>
            <rect x={item.x - 70} y={55} width={140} height={50} rx={10} fill={item.color}
              stroke={active === item.id ? '#1A1916' : 'transparent'} strokeWidth={3} opacity={active && active !== item.id ? 0.4 : 1} />
            {item.label.split('\n').map((line, li) => (
              <text key={li} x={item.x} y={76 + li * 16} textAnchor="middle" fill="#fff" fontSize="13" fontWeight="600">{line}</text>
            ))}
          </g>
        ))}
        <rect x="30" y="130" width="600" height="2" fill="#e5e2dc" />
        <text x="330" y="155" textAnchor="middle" className="ix-svg-small" fill="#888">
          {active ? '↑ Click a different order type or click again to close' : '↑ Click any order type to learn more'}
        </text>
        {active && (
          <foreignObject x="80" y="170" width="500" height="80">
            <div xmlns="http://www.w3.org/1999/xhtml" className="ix-svg-tooltip">
              {items.find(i => i.id === active)?.desc}
            </div>
          </foreignObject>
        )}
      </svg>
    </div>
  );
}

/* ─── SAFE Model Decision Flowchart ─── */
function SAFEModelDiagram() {
  const [active, setActive] = useState(null);
  const steps = [
    { id: 'S', letter: 'S', word: 'Situation', color: '#2563A8', y: 30, desc: 'Assess the situation objectively. What are the facts? What do you observe? Separate facts from assumptions.' },
    { id: 'A', letter: 'A', word: 'Alternatives', color: '#2E7D4F', y: 90, desc: 'Identify all possible courses of action. What are your options? Consider at least 3 alternatives before deciding.' },
    { id: 'F', letter: 'F', word: 'Fit', color: '#C6860A', y: 150, desc: 'Evaluate fit with professional standards. Does each alternative comply with Standard 5.20, your code of ethics, and the court order?' },
    { id: 'E', letter: 'E', word: 'Evaluate', color: '#7C3AED', y: 210, desc: 'Evaluate likely outcomes. What are the consequences of each option for the child, the families, and your professional standing?' },
  ];
  return (
    <div className="ix-svg-wrap">
      <svg viewBox="0 0 600 300" className="ix-svg">
        <text x="300" y="22" textAnchor="middle" className="ix-svg-title">The SAFE Decision-Making Model</text>
        {steps.map((s, i) => (
          <g key={s.id} onClick={() => setActive(active === s.id ? null : s.id)} style={{ cursor: 'pointer' }}>
            {i < steps.length - 1 && (
              <line x1="90" y1={s.y + 36} x2="90" y2={steps[i + 1].y + 8} stroke="#ccc" strokeWidth="2" strokeDasharray="4" />
            )}
            <circle cx="90" cy={s.y + 20} r="18" fill={s.color}
              stroke={active === s.id ? '#1A1916' : 'transparent'} strokeWidth={3} opacity={active && active !== s.id ? 0.4 : 1} />
            <text x="90" y={s.y + 25} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700">{s.letter}</text>
            <text x="120" y={s.y + 25} fill={s.color} fontSize="15" fontWeight="600">{s.word}</text>
            {active === s.id && (
              <foreignObject x="200" y={s.y} width="380" height="50">
                <div xmlns="http://www.w3.org/1999/xhtml" className="ix-svg-tooltip ix-svg-tooltip-sm">{s.desc}</div>
              </foreignObject>
            )}
          </g>
        ))}
        <text x="300" y="290" textAnchor="middle" className="ix-svg-small" fill="#888">
          Click each letter to explore the step
        </text>
      </svg>
    </div>
  );
}

/* ─── CALM Method Diagram ─── */
function CALMMethodDiagram() {
  const [active, setActive] = useState(null);
  const steps = [
    { id: 'C', letter: 'C', word: 'Communicate', color: '#2563A8', desc: 'Use a calm, low tone. Keep sentences short. Acknowledge the person\'s feelings without agreeing with threatening behavior.' },
    { id: 'A', letter: 'A', word: 'Assess', color: '#2E7D4F', desc: 'Continuously assess the threat level. Green = verbal frustration. Yellow = raised voice, pacing. Red = physical threats, blocked exits.' },
    { id: 'L', letter: 'L', word: 'Listen', color: '#C6860A', desc: 'Active listening de-escalates. Reflect what you hear. "I can see you\'re frustrated about the schedule change." Do not argue or correct.' },
    { id: 'M', letter: 'M', word: 'Manage', color: '#C43025', desc: 'Manage the environment and your position. Keep exits clear. Maintain distance. If threat level reaches Red, terminate the visit.' },
  ];
  return (
    <div className="ix-svg-wrap">
      <svg viewBox="0 0 600 200" className="ix-svg">
        <text x="300" y="22" textAnchor="middle" className="ix-svg-title">The CALM De-Escalation Method</text>
        {steps.map((s, i) => {
          const x = 75 + i * 140;
          return (
            <g key={s.id} onClick={() => setActive(active === s.id ? null : s.id)} style={{ cursor: 'pointer' }}>
              {i < steps.length - 1 && <line x1={x + 30} y1={65} x2={x + 110} y2={65} stroke="#ccc" strokeWidth="2" />}
              <circle cx={x} cy={65} r={24} fill={s.color}
                stroke={active === s.id ? '#1A1916' : 'transparent'} strokeWidth={3} opacity={active && active !== s.id ? 0.4 : 1} />
              <text x={x} y={71} textAnchor="middle" fill="#fff" fontSize="18" fontWeight="700">{s.letter}</text>
              <text x={x} y={108} textAnchor="middle" fontSize="11" fontWeight="600" fill="#555">{s.word}</text>
            </g>
          );
        })}
        {active && (
          <foreignObject x="50" y="120" width="500" height="70">
            <div xmlns="http://www.w3.org/1999/xhtml" className="ix-svg-tooltip ix-svg-tooltip-sm">
              <strong>{steps.find(s => s.id === active)?.word}:</strong> {steps.find(s => s.id === active)?.desc}
            </div>
          </foreignObject>
        )}
        {!active && <text x="300" y="145" textAnchor="middle" className="ix-svg-small" fill="#888">Click each step to learn more</text>}
      </svg>
    </div>
  );
}

/* ─── Mandated Reporting Flow Diagram ─── */
function ReportingFlowDiagram() {
  const [step, setStep] = useState(0);
  const flow = [
    { label: 'Observe Concern', desc: 'You observe something during a visit that gives you reasonable suspicion of abuse or neglect.', color: '#C43025' },
    { label: 'Document Immediately', desc: 'Write down exactly what you observed — behavioral language, timestamps, direct quotes. Do not investigate.', color: '#C6860A' },
    { label: 'Call Within 36 Hours', desc: 'Report by phone to CPS (Child Protective Services) or law enforcement. This is YOUR personal obligation.', color: '#2563A8' },
    { label: 'Written Report in 36 Hours', desc: 'File a written report (SS 8572 form) within 36 hours of the phone call. Keep a copy for your records.', color: '#2E7D4F' },
    { label: 'Notify Supervisor', desc: 'Inform your organization per internal protocols. But remember — the legal duty is on you, not your supervisor.', color: '#7C3AED' },
  ];
  return (
    <div className="ix-svg-wrap">
      <svg viewBox="0 0 600 280" className="ix-svg">
        <text x="300" y="22" textAnchor="middle" className="ix-svg-title">Mandated Reporting: Step by Step</text>
        {flow.map((f, i) => {
          const y = 40 + i * 46;
          return (
            <g key={i} onClick={() => setStep(i)} style={{ cursor: 'pointer' }}>
              {i < flow.length - 1 && <line x1="45" y1={y + 20} x2="45" y2={y + 46} stroke="#ccc" strokeWidth="2" />}
              <circle cx="45" cy={y + 8} r={12} fill={step === i ? f.color : '#ddd'} />
              <text x="45" y={y + 13} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700">{i + 1}</text>
              <text x="68" y={y + 13} fontSize="13" fontWeight={step === i ? '700' : '400'} fill={step === i ? f.color : '#555'}>{f.label}</text>
              {step === i && (
                <foreignObject x="68" y={y + 18} width="500" height="32">
                  <div xmlns="http://www.w3.org/1999/xhtml" style={{fontSize:'12px',color:'#555',lineHeight:'1.3'}}>{f.desc}</div>
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─── Visit Workflow Diagram ─── */
function VisitWorkflowDiagram() {
  const [active, setActive] = useState(null);
  const phases = [
    { id: 'pre', label: 'Pre-Visit', color: '#2563A8', items: ['Review court order', 'Safety scan facility', 'Check restricted parties', 'Prepare documentation'] },
    { id: 'arrival', label: 'Arrival', color: '#2E7D4F', items: ['Greet parties separately', 'Confirm identities', 'Review visit rules', 'Stagger arrivals'] },
    { id: 'visit', label: 'During Visit', color: '#C6860A', items: ['Observe & document', 'Maintain sight lines', 'Note behaviors objectively', 'Monitor time limits'] },
    { id: 'departure', label: 'Departure', color: '#7C3AED', items: ['End visit on time', 'Stagger departures', 'Secure child handoff', 'Complete report'] },
  ];
  return (
    <div className="ix-svg-wrap">
      <svg viewBox="0 0 660 220" className="ix-svg">
        <text x="330" y="22" textAnchor="middle" className="ix-svg-title">Visit Workflow: Four Phases</text>
        {phases.map((p, i) => {
          const x = 40 + i * 160;
          return (
            <g key={p.id} onClick={() => setActive(active === p.id ? null : p.id)} style={{ cursor: 'pointer' }}>
              {i < phases.length - 1 && <line x1={x + 120} y1={60} x2={x + 140} y2={60} stroke="#ccc" strokeWidth="2" />}
              <rect x={x} y={38} width={120} height={36} rx={8} fill={p.color}
                opacity={active && active !== p.id ? 0.4 : 1} stroke={active === p.id ? '#1A1916' : 'transparent'} strokeWidth={2} />
              <text x={x + 60} y={61} textAnchor="middle" fill="#fff" fontSize="13" fontWeight="600">{p.label}</text>
            </g>
          );
        })}
        {active && (
          <g>
            {phases.find(p => p.id === active)?.items.map((item, ii) => (
              <text key={ii} x={330} y={100 + ii * 22} textAnchor="middle" fontSize="13" fill="#444">
                • {item}
              </text>
            ))}
          </g>
        )}
        {!active && <text x="330" y="110" textAnchor="middle" className="ix-svg-small" fill="#888">Click any phase to see the checklist</text>}
      </svg>
    </div>
  );
}

/* ─── Main renderer: maps interactive JSON to components ─── */
export function renderInteractive(item, idx) {
  switch (item.type) {
    case 'knowledge_check':
      return <KnowledgeCheck key={idx} {...item} />;
    case 'scenario_reveal':
      return <ScenarioReveal key={idx} {...item} />;
    case 'step_by_step':
      return <StepByStep key={idx} {...item} />;
    case 'diagram':
      return <InteractiveDiagram key={idx} diagramId={item.diagramId} title={item.title} />;
    default:
      return null;
  }
}
