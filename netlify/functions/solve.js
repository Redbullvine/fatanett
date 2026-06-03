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

  if (!problem || typeof problem !== 'string' || problem.length > 600) {
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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 64,
        system: `You solve math problems and math word problems.
Reply with ONLY the final answer — a number or very short phrase.
No explanation, no working, no sentence.
If the input cannot be solved as a math or logic problem, reply with exactly: Invalid`,
        messages: [{ role: 'user', content: problem }]
      })
    });

    const data = await res.json();
    const answer = data.content?.[0]?.text?.trim() ?? 'Error';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ answer })
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Solve failed' }) };
  }
};
