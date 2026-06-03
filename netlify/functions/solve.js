/**
 * Relay Math Solver — Netlify Function (orchestrator)
 *
 * Routes requests:
 *   simple problems   → Claude directly (fast, cheap)
 *   medium / advanced → Python solver service (SymPy, verified)
 *                       Falls back to Claude if the service is unavailable.
 *
 * Environment variables required:
 *   ANTHROPIC_API_KEY  — Claude API key
 *   SOLVER_URL         — URL of the Python FastAPI service
 *                        (e.g. https://relay-solver.railway.app)
 *                        Leave unset to always use Claude fallback.
 */

'use strict';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5';

// ── Difficulty classifier (mirrors solver/classifier.py) ─────────────────────
// Keep in sync with the Python version so routing decisions match.

const ADVANCED_RE = [
  /\b(minimize|maximize|minimum|maximum|optimal|optimize|least cost|cheapest)\b/i,
  /\b(lagrange|lagrangian)\b/i,
  /\b(derivative|differentiate|integral|integrate|antiderivative)\b/i,
  /\b(differential equation|ODE|PDE|initial value)\b/i,
  /\b(related rates|implicit differentiat)\b/i,
  /\b(surface of revolution|washer|shell method|disk method)\b/i,
  /\b(surface area|volume).{0,40}(cylinder|cone|sphere|hemisphere)\b/i,
  /\b(partial derivative|gradient|jacobian|hessian)\b/i,
  /\b(double integral|triple integral|line integral|surface integral)\b/i,
  /\b(taylor series|maclaurin|fourier|radius of convergence)\b/i,
  /\b(l.{0,2}hopital|limit as)\b/i,
  /\b(eigenvalue|eigenvector|matrix invers)\b/i,
];

const MEDIUM_RE = [
  /\b(quadratic formula|completing the square)\b/i,
  /\b(system of (equations|inequalities))\b/i,
  /\b(logarithm|exponential growth|decay)\b/i,
  /\b(percent|compound interest)\b/i,
];

function classifyProblem(text) {
  for (const re of ADVANCED_RE) if (re.test(text)) return 'advanced';
  for (const re of MEDIUM_RE)   if (re.test(text)) return 'medium';
  if (text.split(/\s+/).length > 30) return 'medium';
  return 'simple';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function claudeSolve(problem) {
  /**
   * Strong-prompted Claude call — used for simple problems and as fallback.
   * Returns { steps: string[], answer: string }
   */
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const system = `You solve math and word problems with precision.

ARITHMETIC RULES — CRITICAL:
- Compute every numerical sub-result explicitly before the next step.
- For roots/powers show the radicand first: e.g. "r³ = 5400/π ≈ 1718.87, r = ∛1718.87 ≈ 11.98"
- Verify by substituting final values back into the original constraint. Show the check.
- Use 4+ decimal places for intermediates. Round only the displayed answer.
- Check domain constraints (positive lengths, valid probabilities, etc.).

OUTPUT — ONLY valid JSON (no markdown, no fences):
{"steps":["step 1","step 2","step 3","step 4","step 5"],"answer":"final answer with units"}

Steps: 4-6, covering setup → key equation → substitution → numerical solve → verification.
Symbols: ×, ÷, =, ≈, π, √, ², ³, −, ∛
For non-math input: {"steps":[],"answer":"Not a math problem"}`;

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: problem }],
    }),
  });

  const data = await res.json();
  if (data.type === 'error') throw new Error(data.error?.message || 'Claude API error');

  const raw = (data.content?.find(b => b.type === 'text')?.text || '').trim();

  // Parse JSON — try direct, then extract from surrounding text
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    const m = raw.match(/\{[\s\S]*\}/);
    try { parsed = JSON.parse(m?.[0] || '{}'); } catch (_2) { parsed = {}; }
  }

  return {
    steps:    Array.isArray(parsed.steps) ? parsed.steps : [],
    answer:   parsed.answer || 'Error',
    verified: false,
    method:   'llm',
  };
}

async function pythonSolve(problem) {
  /**
   * Call the Python FastAPI solver service.
   * Returns the same { steps, answer, verified, method } shape.
   */
  const url = process.env.SOLVER_URL;
  if (!url) throw new Error('SOLVER_URL not configured');

  const res = await fetch(`${url.replace(/\/$/, '')}/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problem }),
    signal: AbortSignal.timeout(40_000),  // 40s — SymPy can be slow
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Solver service error ${res.status}: ${body}`);
  }

  return await res.json();
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Parse body
  let problem;
  try {
    problem = JSON.parse(event.body || '{}').problem;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!problem || typeof problem !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing problem' }) };
  }

  problem = problem.trim();
  if (problem.length > 3000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Problem too long' }) };
  }

  const difficulty = classifyProblem(problem);
  let result;

  if (difficulty === 'simple' || !process.env.SOLVER_URL) {
    // Simple problems or no Python service configured → Claude directly
    result = await claudeSolve(problem);
    result.difficulty = difficulty;
  } else {
    // Medium / Advanced → Python solver (SymPy-backed)
    try {
      result = await pythonSolve(problem);
      result.difficulty = difficulty;
    } catch (err) {
      console.error('Python solver failed, falling back to Claude:', err.message);
      result = await claudeSolve(problem);
      result.method = 'llm_fallback';
      result.difficulty = difficulty;
      result.verified = false;
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({
      steps:      result.steps    || [],
      answer:     result.answer   || 'Error',
      verified:   result.verified || false,
      method:     result.method   || 'unknown',
      difficulty: result.difficulty || difficulty,
    }),
  };
};
