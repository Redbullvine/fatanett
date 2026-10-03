const test = require('node:test');
const assert = require('node:assert/strict');

const { handler } = require('../netlify/functions/solve');

const OVERLOADED = 'Relay is overloaded with computing right now. Please try again later.';

function postEvent(problem) {
  return {
    httpMethod: 'POST',
    body: JSON.stringify({ problem })
  };
}

test('uses local arithmetic when SOLVER_URL is not configured', async function() {
  const originalSolverUrl = process.env.SOLVER_URL;
  delete process.env.SOLVER_URL;

  try {
    const response = await handler(postEvent('2+2'));
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, 'LOCAL_VERIFIED');
    assert.equal(body.verified, true);
    assert.equal(body.method, 'local_arithmetic');
    assert.equal(body.answer_summary, '4');
  } finally {
    if (originalSolverUrl) process.env.SOLVER_URL = originalSolverUrl;
  }
});

test('treats x between numbers as multiplication', async function() {
  const originalSolverUrl = process.env.SOLVER_URL;
  delete process.env.SOLVER_URL;

  try {
    const response = await handler(postEvent('99999999x85'));
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, 'LOCAL_VERIFIED');
    assert.equal(body.method, 'local_arithmetic');
    assert.equal(body.answer_summary, '8,499,999,915');
  } finally {
    if (originalSolverUrl) process.env.SOLVER_URL = originalSolverUrl;
  }
});

test('keeps compute-overloaded for unsupported local problems', async function() {
  const originalSolverUrl = process.env.SOLVER_URL;
  delete process.env.SOLVER_URL;

  try {
    const response = await handler(postEvent('Find all positive integers'));
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, false);
    assert.equal(body.status, 'COMPUTE_OVERLOADED');
    assert.equal(body.verified, false);
    assert.equal(body.answer_summary, OVERLOADED);
    assert.equal(body.solution_markdown, OVERLOADED);
  } finally {
    if (originalSolverUrl) process.env.SOLVER_URL = originalSolverUrl;
  }
});

test('does not guess on equations with multiple variables', async function() {
  const originalSolverUrl = process.env.SOLVER_URL;
  delete process.env.SOLVER_URL;

  try {
    const response = await handler(postEvent('solve x = y'));
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, false);
    assert.equal(body.status, 'COMPUTE_OVERLOADED');
    assert.equal(body.answer_summary, OVERLOADED);
  } finally {
    if (originalSolverUrl) process.env.SOLVER_URL = originalSolverUrl;
  }
});

test('proxies verified solver responses without changing the contract', async function() {
  const originalSolverUrl = process.env.SOLVER_URL;
  const originalFetch = global.fetch;

  process.env.SOLVER_URL = 'https://solver.example.test';
  global.fetch = async function(url, options) {
    assert.equal(url, 'https://solver.example.test/solve');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { problem: 'integrate x^3 from 0 to 1', network_stats: null });

    return {
      ok: true,
      json: async function() {
        return {
          ok: true,
          status: 'LOCAL_VERIFIED',
          verified: true,
          method: 'arithmetic',
          classification: 'simple',
          answer_summary: '1/4',
          solution_markdown: '**Integral:** 1/4',
          verification: {
            sympy_passed: true,
            scipy_passed: true,
            wolfram_used: false,
            wolfram_passed: false,
            cheap_verifier_used: false,
            cheap_verifier_passed: false,
            checks: ['2+2 = 4']
          },
          warnings: []
        };
      }
    };
  };

  try {
    const response = await handler(postEvent('integrate x^3 from 0 to 1'));
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, 'LOCAL_VERIFIED');
    assert.equal(body.verified, true);
    assert.equal(body.answer_summary, '1/4');
  } finally {
    global.fetch = originalFetch;
    if (originalSolverUrl) {
      process.env.SOLVER_URL = originalSolverUrl;
    } else {
      delete process.env.SOLVER_URL;
    }
  }
});

test('converts solver fetch failures to compute-overloaded', async function() {
  const originalSolverUrl = process.env.SOLVER_URL;
  const originalFetch = global.fetch;

  process.env.SOLVER_URL = 'https://solver.example.test';
  global.fetch = async function() {
    throw new Error('network down');
  };

  try {
    const response = await handler(postEvent('advanced problem'));
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, false);
    assert.equal(body.status, 'COMPUTE_OVERLOADED');
    assert.equal(body.answer_summary, OVERLOADED);
    assert.match(body.warnings.join(' '), /network down/);
  } finally {
    global.fetch = originalFetch;
    if (originalSolverUrl) {
      process.env.SOLVER_URL = originalSolverUrl;
    } else {
      delete process.env.SOLVER_URL;
    }
  }
});

test('uses local math before calling the solver service', async function() {
  const originalSolverUrl = process.env.SOLVER_URL;
  const originalFetch = global.fetch;
  let fetchCalled = false;

  process.env.SOLVER_URL = 'https://solver.example.test';
  global.fetch = async function() {
    fetchCalled = true;
    throw new Error('network down');
  };

  try {
    const response = await handler(postEvent('solve for x: 2x + 3 = 11'));
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, 'LOCAL_VERIFIED');
    assert.equal(body.method, 'local_equation');
    assert.equal(body.answer_summary, 'x = 4');
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
    if (originalSolverUrl) {
      process.env.SOLVER_URL = originalSolverUrl;
    } else {
      delete process.env.SOLVER_URL;
    }
  }
});

test('solves common word problems locally', async function() {
  const originalSolverUrl = process.env.SOLVER_URL;
  delete process.env.SOLVER_URL;

  try {
    const response = await handler(postEvent('If a train travels 60 mph for 2.5 hrs, how far?'));
    const body = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, 'LOCAL_VERIFIED');
    assert.equal(body.method, 'local_word_problem');
    assert.equal(body.answer_summary, '150 miles');
  } finally {
    if (originalSolverUrl) process.env.SOLVER_URL = originalSolverUrl;
  }
});
