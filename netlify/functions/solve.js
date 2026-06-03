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
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'interleaved-thinking-2025-05-14'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 8000,
        thinking: { type: 'enabled', budget_tokens: 5000 },
        system: `You are a math and word problem solver for a speed test page.
Solve the given math equation or word problem. Work through it carefully.
Reply with ONLY the final answer — a number, a unit+number, or a brief phrase (e.g. "150 miles", "42", "12 hours").
No explanation in your reply. No working shown. No full sentences.
If the problem implies a question without asking one explicitly, answer the implied question.
Only reply with exactly the word Invalid if the input has zero mathematical or logical content.`,
        messages: [{ role: 'user', content: problem }]
      })
    });

    const data = await res.json();
    const textBlock = data.content?.find(function(b) { return b.type === 'text'; });
    const answer = textBlock?.text?.trim() ?? 'Error';

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ answer })
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Solve failed' }) };
  }
};
