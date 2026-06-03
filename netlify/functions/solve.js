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
        system: `You are a precise mathematical solver. Solve the problem step by step with careful arithmetic.

CRITICAL RULES FOR ARITHMETIC ACCURACY:
- Compute every numerical value explicitly. Never skip a calculation.
- When taking roots or powers, show the intermediate value first: e.g. "r³ = 5400/π ≈ 1718.87, so r = ∛1718.87 ≈ 11.98"
- Verify your answer by substituting final values back into the original equation.
- If the verification does not match, redo the arithmetic before responding.
- Use enough decimal places (2–3) to avoid rounding errors that compound.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown, no extra text:
{"steps":["step 1","step 2","step 3","step 4"],"answer":"final answer with units"}

Step guidelines:
- 3 to 5 steps covering: setup, substitution, derivative/algebra, numerical solve, result
- Use symbols: ×, ÷, =, ≈, π, √, ², ³, −
- answer: concise final result with units (e.g. "r ≈ 11.98 m, h ≈ 18.63 m, cost ≈ $135,251")
- For non-math input: {"steps":[],"answer":"Not a math problem"}`,
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
