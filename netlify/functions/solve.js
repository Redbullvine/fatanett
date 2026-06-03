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
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: `You solve math problems and word problems with the precision of an MIT mathematician.
Respond with ONLY valid JSON — no markdown, no explanation, nothing else:
{"steps":["step 1","step 2","step 3"],"answer":"final answer"}

Rules:
- steps: 2 to 4 key calculation lines using proper symbols: ×, ÷, =, ≈, π, √, ², ³, −
- For calculus problems show: volume/cost setup, substitution, derivative = 0, result
- answer: final result with units when relevant (e.g. "105 trays", "≈ $147,283", "150 miles")
- For non-math input: {"steps":[],"answer":"Invalid"}`,
        messages: [{ role: 'user', content: problem }]
      })
    });

    const data = await res.json();
    if (data.type === 'error') {
      return { statusCode: 502, body: JSON.stringify({ error: data.error?.message || 'API error' }) };
    }
    const textBlock = data.content?.find(function(b) { return b.type === 'text'; });
    const raw = textBlock?.text?.trim() ?? '';

    let steps = [], answer = 'Error';
    try {
      // First try direct parse (model followed instructions)
      const parsed = JSON.parse(raw);
      steps  = Array.isArray(parsed.steps) ? parsed.steps : [];
      answer = parsed.answer || 'Error';
    } catch (_) {
      // Model added surrounding text — extract the JSON object from within it
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          steps  = Array.isArray(parsed.steps) ? parsed.steps : [];
          answer = parsed.answer || 'Error';
        } catch (_2) {
          answer = 'Error';
        }
      } else {
        answer = 'Error';
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ steps: steps, answer: answer })
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Solve failed' }) };
  }
};
