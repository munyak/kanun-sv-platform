/**
 * KaNun Academy — LLM Proxy (Netlify Serverless Function)
 * Proxies requests to Anthropic Claude API for:
 *   - Scenario generation & evaluation
 *   - Socratic tutoring
 *   - Practice quiz generation
 *   - Report review
 *
 * Set ANTHROPIC_API_KEY in Netlify env vars.
 * Optionally set LLM_MODEL (default: claude-sonnet-4-20250514)
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

// ─── System prompts per mode ───

const SYSTEM_PROMPTS = {
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

  const { mode, messages, domain, difficulty, count, bloomsLevel } = body;

  if (!mode || !SYSTEM_PROMPTS[mode]) {
    return respond(400, { error: `Invalid mode. Use: ${Object.keys(SYSTEM_PROMPTS).join(', ')}` });
  }

  // Build the messages array for Claude
  const systemPrompt = SYSTEM_PROMPTS[mode];
  let userMessages = [];

  if (mode === 'quiz') {
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
    const resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
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
