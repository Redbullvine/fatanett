/**
 * Relay Math Solver — Netlify Function (thin proxy)
 *
 * All solving, classification, and verification happens in the
 * Python relay-solver service (SOLVER_URL).
 *
 * This function:
 *   - Receives requests from the browser
 *   - Forwards to relay-solver
 *   - Never exposes API keys to the frontend
 *   - Returns COMPUTE_OVERLOADED if the service is unavailable
 *
 * Required Netlify env var:
 *   SOLVER_URL = https://your-render-service.onrender.com
 */

'use strict';

const OVERLOADED = 'Relay is overloaded with computing right now. Please try again later.';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function overloadedResponse(reason) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify({
      ok:                false,
      status:            'COMPUTE_OVERLOADED',
      verified:          false,
      method:            'unavailable',
      classification:    'unknown',
      answer_summary:    OVERLOADED,
      solution_markdown: OVERLOADED,
      verification: {
        sympy_passed:          false,
        scipy_passed:          false,
        wolfram_used:          false,
        wolfram_passed:        false,
        cheap_verifier_used:   false,
        cheap_verifier_passed: false,
        checks:                [],
      },
      warnings: [reason || 'Solver service unavailable.'],
    }),
  };
}

exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Parse body
  let problem, networkStats;
  try {
    const body = JSON.parse(event.body || '{}');
    problem      = (body.problem || '').trim();
    networkStats = body.network_stats || null;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!problem) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing problem' }) };
  }
  if (problem.length > 6000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Problem too long' }) };
  }

  // Route to solver service
  const solverUrl = process.env.SOLVER_URL;
  if (!solverUrl) {
    return overloadedResponse('SOLVER_URL not configured.');
  }

  let resp;
  try {
    resp = await fetch(`${solverUrl.replace(/\/$/, '')}/solve`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ problem, network_stats: networkStats }),
      signal:  AbortSignal.timeout(50_000),   // 50s — SymPy + Opus can be slow
    });
  } catch (err) {
    return overloadedResponse(`Solver timeout or network error: ${err.message}`);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return overloadedResponse(`Solver returned ${resp.status}: ${body}`);
  }

  let data;
  try {
    data = await resp.json();
  } catch {
    return overloadedResponse('Solver returned invalid JSON.');
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(data),
  };
};
