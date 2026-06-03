exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let problem;
  try {
    problem = JSON.parse(event.body).problem;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!problem || typeof problem !== 'string' || problem.length > 2000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid input' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interleaved-thinking-2025-05-14'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 8000,
        thinking: { type: 'enabled', budget_tokens: 5000 },
        system: `You solve math problems and word problems with the rigor of an MIT mathematician.
Respond in this EXACT format — no other text:
STEPS:[step 1]|[step 2]|[step 3]
ANSWER:[final answer]

Rules:
- 2 to 4 steps, each a single clean equation or key calculation
- Use proper math symbols: ×, ÷, =, ≈, π, √, ², ³, −
- ANSWER includes units when relevant (e.g. "105 trays", "≈ $147,283", "150 miles")
- No spaces around the pipe | between steps
- If input has no mathematical content, respond with exactly: STEPS:—\nANSWER:Invalid`,
        messages: [{ role: 'user', content: problem }]
      })
    });

    const data = await res.json();
    const textBlock = data.content?.find(function(b) { return b.type === 'text'; });
    const raw = textBlock?.text?.trim() ?? '';

    const stepsMatch = raw.match(/STEPS:(.*)/);
    const answerMatch = raw.match(/ANSWER:(.*)/);
    const steps = stepsMatch
      ? stepsMatch[1].split('|').map(function(s){ return s.trim(); }).filter(Boolean)
      : [];
    const answer = answerMatch ? answerMatch[1].trim() : raw;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ steps: steps, answer: answer })
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Solve failed' }) };
  }
};
