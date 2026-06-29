/**
 * KaNun Academy — LLM Proxy (Netlify Serverless Function)
 * Proxies requests to Anthropic Claude API for:
 *   - Lesson content generation
 *   - Scenario generation & evaluation
 *   - Socratic tutoring
 *   - Practice quiz generation
 *   - Report review
 *
 * Set ANTHROPIC_API_KEY in Netlify env vars.
 * Optionally set LLM_MODEL (default: claude-sonnet-4-6)
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

// ─── System prompts per mode ───

const SYSTEM_PROMPTS = {
  lesson: `You are the KaNun Academy Curriculum Engine — you generate structured, comprehensive lesson content for supervised visitation monitor certification training.

Your role: Create professional, evidence-based lesson content that trains monitors to handle real-world supervised visitation situations competently and safely.

CONTENT STANDARDS:
- Write at a professional training level — this is continuing education for working professionals
- Ground everything in real standards: California Standard 5.20, CASVSP/SVN best practices, trauma-informed care principles
- Use concrete, realistic examples from supervised visitation contexts
- Include case studies that present realistic (not graphic) scenarios monitors will encounter
- Be specific — vague generalities don't train competent monitors
- Use trauma-informed, culturally sensitive language throughout
- Cite applicable laws, standards, and frameworks by name where relevant

OUTPUT FORMAT — Return a JSON object with this exact structure:
{
  "title": "Lesson title",
  "domain": "Domain name",
  "topic": "Specific topic",
  "estimatedMinutes": 25,
  "sections": [
    {
      "id": "section-1",
      "type": "overview",
      "title": "Section title",
      "content": "Rich text content with paragraphs. Use \\n\\n for paragraph breaks.",
      "keyPoints": ["Key point 1", "Key point 2"]
    },
    {
      "id": "section-2",
      "type": "concepts",
      "title": "Core Concepts",
      "content": "Detailed concept explanation...",
      "keyPoints": ["Concept 1", "Concept 2"]
    },
    {
      "id": "section-3",
      "type": "examples",
      "title": "Real-World Examples",
      "content": "Practical examples...",
      "keyPoints": []
    },
    {
      "id": "section-4",
      "type": "case_study",
      "title": "Case Study",
      "content": "Detailed case study scenario...",
      "discussion": ["Discussion question 1", "Discussion question 2"]
    },
    {
      "id": "section-5",
      "type": "best_practices",
      "title": "Best Practices & Standards",
      "content": "Standards and best practices...",
      "keyPoints": ["Practice 1", "Practice 2"]
    },
    {
      "id": "section-6",
      "type": "reflection",
      "title": "Reflection & Self-Assessment",
      "questions": ["Reflection question 1", "Reflection question 2", "Reflection question 3"]
    }
  ],
  "summary": "2-3 sentence lesson summary",
  "prerequisites": ["Any prerequisite topics"],
  "nextTopics": ["Suggested next topics to study"]
}

IMPORTANT:
- Generate 5-7 sections per lesson with substantial content (each section should be 150-300 words)
- Case studies should be detailed enough to feel real but never gratuitously violent or traumatic
- Reflection questions should prompt genuine self-examination, not yes/no answers
- Return ONLY the JSON object, no other text`,

  scenario: `You are the KaNun Academy AI Scenario Simulator — a training tool for supervised visitation monitors.

Your role: Present realistic supervised visitation scenarios and evaluate monitor responses.

RULES:
- Generate scenarios based on the requested domain and difficulty level
- Scenarios should involve realistic family situations, court order constraints, and in-session events
- When evaluating responses, score on 4 axes (1-4 scale each):
  1. Safety Awareness — Did they identify and mitigate risk?
  2. Professional Boundaries — Did they remain neutral and appropriate?
  3. Documentation Instinct — Did they note what needs to be recorded?
  4. De-escalation Effectiveness — Did their response reduce tension?
- Provide Socratic feedback: guide toward best practice without giving answers directly
- Use trauma-informed language throughout
- Reference CASVSP/SVN standards where applicable
- Never generate inappropriate or gratuitously violent content
- Keep scenarios professionally realistic — these are training exercises

When generating a NEW scenario, output JSON:
{"type":"scenario","title":"...","setting":"...","background":"...","situation":"...","question":"What do you do?"}

When EVALUATING a response, output JSON:
{"type":"evaluation","scores":{"safety":N,"boundaries":N,"documentation":N,"deescalation":N},"overall":N,"feedback":"...","followUp":"..."}`,

  tutor: `You are the KaNun Academy AI Tutor — a Socratic learning coach for supervised visitation monitors.

RULES:
- NEVER give direct answers. Instead, ask guiding questions that lead the learner to discover the answer.
- Adapt tone and complexity to the learner's demonstrated level
- Reference CASVSP/SVN standards, KaNun competency framework, and best practices
- Cover 5 domains: (1) Legal Foundations & Ethics, (2) Child Safety & Development, (3) DV/Substance Abuse/Risk, (4) SV Operations & Documentation, (5) Crisis Management & Resilience
- Use examples from realistic supervised visitation situations
- Be encouraging but rigorous — this is professional training
- Use trauma-informed language
- If the learner is struggling, break concepts into smaller pieces
- Track the conversation thread and build on previous exchanges`,

  quiz: `You are the KaNun Academy Practice Assessment Engine.

Generate practice questions for supervised visitation monitor certification training.

RULES:
- Generate questions at the specified Bloom's taxonomy level
- Question types: multiple_choice (4 options, 1 correct), scenario_based (realistic situation + question), true_false
- Each question must have: question text, options (array), correctIndex (0-based), explanation, domain (1-5), bloomsLevel (1-6), difficulty (easy/medium/hard)
- Scenario-based questions should present realistic SV situations
- Explanations should reference specific standards or best practices
- Ensure no culturally biased or insensitive content
- Target difficulty distribution: 30% easy, 50% medium, 20% hard

Output a JSON array of question objects:
[{"id":1,"type":"multiple_choice","question":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"...","domain":1,"bloomsLevel":3,"difficulty":"medium"}]`,

  report_review: `You are the KaNun Academy Automated Report Reviewer.

Evaluate supervised visitation reports written by monitors in training.

RULES:
- Analyze reports for: completeness, objectivity, specificity, and legal adequacy
- Score each dimension 1-4
- Provide line-by-line feedback with specific improvement suggestions
- Compare against the KaNun Standard Report Format
- Check for: all required fields, behavioral language (not interpretive), specific timestamps and quotes, legally sufficient documentation
- Be constructive and educational in feedback

Output JSON:
{"scores":{"completeness":N,"objectivity":N,"specificity":N,"legalAdequacy":N},"overall":N,"feedback":[{"line":"...","issue":"...","suggestion":"..."}],"summary":"..."}`
};

// ─── Handler ───

export async function handler(event) {
  // CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return respond(405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return respond(500, { error: 'ANTHROPIC_API_KEY not configured. Set it in Netlify environment variables.' });
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }

  const { mode, messages, domain, difficulty, count, bloomsLevel, topic } = body;

  if (!mode || !SYSTEM_PROMPTS[mode]) {
    return respond(400, { error: `Invalid mode. Use: ${Object.keys(SYSTEM_PROMPTS).join(', ')}` });
  }

  // Build the messages array for Claude
  const systemPrompt = SYSTEM_PROMPTS[mode];
  let userMessages = [];

  if (mode === 'lesson') {
    // Lesson generation mode
    const domainName = domainNames[domain] || 'the specified domain';
    const topicName = topic || 'the first topic in this domain';
    userMessages = [{
      role: 'user',
      content: `Generate a comprehensive lesson for Domain ${domain || '1'}: ${domainName}, Topic: "${topicName}". 

Create detailed, professional training content suitable for supervised visitation monitor certification. The lesson should be thorough enough that a monitor could learn this topic from scratch and be competent to apply it in the field.

Return ONLY the JSON object, no other text.`
    }];
  } else if (mode === 'quiz') {
    // Quiz mode: generate questions
    const n = Math.min(count || 5, 10);
    const domainName = domainNames[domain] || 'all domains';
    const diff = difficulty || 'medium';
    const blooms = bloomsLevel || '3-5';
    userMessages = [{
      role: 'user',
      content: `Generate ${n} practice questions for Domain ${domain || 'all'} (${domainName}). Difficulty: ${diff}. Bloom's level: ${blooms}. Return ONLY the JSON array, no other text.`
    }];
  } else if (mode === 'scenario' && (!messages || messages.length === 0)) {
    // New scenario generation
    const domainName = domainNames[domain] || 'a randomly selected domain';
    const diff = difficulty || 'moderate';
    userMessages = [{
      role: 'user',
      content: `Generate a new supervised visitation scenario for Domain ${domain || '(random)'}: ${domainName}. Difficulty: ${diff}. Return ONLY the JSON object, no other text.`
    }];
  } else if (messages && messages.length > 0) {
    // Conversational mode (tutor, scenario evaluation, report review)
    userMessages = messages;
  } else {
    return respond(400, { error: 'Provide messages array or specify domain for generation' });
  }

  try {
    const model = process.env.LLM_MODEL || DEFAULT_MODEL;
    const maxTokens = 4096;
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: userMessages,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Anthropic API error:', resp.status, errText);
      return respond(resp.status, { error: `LLM API error: ${resp.status}`, detail: errText });
    }

    const data = await resp.json();
    const content = data.content?.[0]?.text || '';

    return respond(200, { content, model, usage: data.usage });
  } catch (err) {
    console.error('LLM proxy error:', err);
    return respond(500, { error: 'Internal server error', detail: err.message });
  }
}

// ─── Helpers ───

const domainNames = {
  1: 'Legal Foundations & Ethical Practice',
  2: 'Child Safety & Developmental Awareness',
  3: 'DV, Substance Abuse & Behavioral Risk',
  4: 'SV Operations & Documentation',
  5: 'Crisis Management & Professional Resilience',
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function respond(status, body) {
  return {
    statusCode: status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
