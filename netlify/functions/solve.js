const VERIFIED_SOLVER_MESSAGE =
  'Relay can solve arithmetic and supported formulas directly. This advanced problem needs a verified solver.';

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

const ADVANCED_PATTERNS = [
  { label: 'minimize', pattern: /\bminimi[sz](?:e|es|ed|ing)\b/i },
  { label: 'maximize', pattern: /\bmaximi[sz](?:e|es|ed|ing)\b/i },
  { label: 'second derivative', pattern: /\bsecond\s+derivative\b/i },
  { label: 'derivative', pattern: /\bderivative\b/i },
  { label: 'critical point', pattern: /\bcritical\s+points?\b/i },
  { label: 'constraint', pattern: /\bconstraints?\b/i },
  { label: 'paraboloid', pattern: /\bparaboloids?\b/i },
  { label: 'hemisphere', pattern: /\bhemispheres?\b/i },
  { label: 'volume optimization', pattern: /\bvolume\s+optimization\b/i },
  { label: 'surface area derivation', pattern: /\b(?:surface\s+area\s+(?:derivation|derive|derived|integral)|derive\b[\s\S]{0,60}\bsurface\s+area)\b/i },
  { label: 'exact form', pattern: /\bexact\s+form\b/i },
  { label: 'global minimum', pattern: /\bglobal\s+minimum\b/i },
  { label: 'calculus', pattern: /\bcalculus\b/i }
];

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(body)
  };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    throw new Error('Non-finite result');
  }

  if (Object.is(value, -0)) return '0';
  if (Number.isInteger(value)) return String(value);

  return String(Number(value.toFixed(12)));
}

class ArithmeticParser {
  constructor(input) {
    this.input = input;
    this.index = 0;
  }

  parse() {
    const value = this.parseExpression();
    this.skipWhitespace();

    if (this.index !== this.input.length) {
      throw new Error('Unexpected token');
    }

    return value;
  }

  parseExpression() {
    let value = this.parseTerm();

    while (true) {
      this.skipWhitespace();
      const operator = this.peek();

      if (operator !== '+' && operator !== '-') break;

      this.index += 1;
      const right = this.parseTerm();
      value = operator === '+' ? value + right : value - right;
    }

    return value;
  }

  parseTerm() {
    let value = this.parseFactor();

    while (true) {
      this.skipWhitespace();
      const operator = this.peek();

      if (operator !== '*' && operator !== '/') break;

      this.index += 1;
      const right = this.parseFactor();

      if (operator === '/') {
        if (right === 0) throw new Error('Division by zero');
        value = value / right;
      } else {
        value = value * right;
      }
    }

    return value;
  }

  parseFactor() {
    this.skipWhitespace();
    const current = this.peek();

    if (current === '+' || current === '-') {
      this.index += 1;
      const value = this.parseFactor();
      return current === '-' ? -value : value;
    }

    if (current === '(') {
      this.index += 1;
      const value = this.parseExpression();
      this.skipWhitespace();

      if (this.peek() !== ')') {
        throw new Error('Missing closing parenthesis');
      }

      this.index += 1;
      return value;
    }

    return this.parseNumber();
  }

  parseNumber() {
    this.skipWhitespace();
    const rest = this.input.slice(this.index);
    const match = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/);

    if (!match) {
      throw new Error('Expected number');
    }

    this.index += match[0].length;
    return Number(match[0]);
  }

  peek() {
    return this.input[this.index];
  }

  skipWhitespace() {
    while (/\s/.test(this.peek())) {
      this.index += 1;
    }
  }
}

function directExpressionSolver(problem) {
  const expression = problem.trim();

  if (!expression || !/[0-9]/.test(expression)) return null;
  if (/[A-Za-z]/.test(expression)) return null;
  if (!/^[0-9+\-*/().\s]+$/.test(expression)) return null;

  try {
    const parser = new ArithmeticParser(expression);
    const value = parser.parse();
    const answer = formatNumber(value);

    return {
      status: 'solved',
      solver: 'directExpressionSolver',
      problem,
      expression,
      answer,
      steps: [
        `Problem: ${problem}`,
        `Expression: ${expression}`,
        `Answer: ${answer}`
      ]
    };
  } catch {
    return null;
  }
}

function unsupportedAdvancedProblemGate(problem) {
  const matches = ADVANCED_PATTERNS
    .filter(function(entry) {
      return entry.pattern.test(problem);
    })
    .map(function(entry) {
      return entry.label;
    });

  if (!matches.length) return null;

  return {
    status: 'rejected',
    solver: 'unsupportedAdvancedProblemGate',
    title: 'Unsupported advanced problem',
    problem,
    message: VERIFIED_SOLVER_MESSAGE,
    matches,
    answer: VERIFIED_SOLVER_MESSAGE,
    steps: [
      'Unsupported advanced problem',
      VERIFIED_SOLVER_MESSAGE
    ]
  };
}

function extractNumberTokens(text) {
  const tokens = [];
  const regex = /(?:^|[^\w.])(-?\d+(?:\.\d+)?)(?![\w.])/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[1]);
  }

  return tokens;
}

function parsePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function supportedWordProblemSolver(problem) {
  const text = problem.toLowerCase().replace(/\s+/g, ' ').trim();

  if (!/\bsame\s+number\b/.test(text)) return null;
  if (!/\bsplit\s+evenly\b/.test(text)) return null;

  const cabinetsMatch = text.match(/\bin\s+(\d+(?:\.\d+)?)\s+cabinets?\b/);
  const traysMatch = text.match(/\beach\s+cabinet\s+(?:gets|receives|has|contains|holds)\s+(\d+(?:\.\d+)?)\s+trays?\b/);
  const removedMatch = text.match(/\b(\d+(?:\.\d+)?)\s+trays?\s+(?:are\s+|were\s+)?(?:removed|taken\s+away|discarded)\b/);
  const zonesMatch = text.match(/\bsplit\s+evenly\s+(?:between|among|into)\s+(\d+(?:\.\d+)?)\s+(?:service\s+)?zones?\b/);
  const asksForEachZone = /\bhow\s+many\s+trays\b[\s\S]*\b(?:each\s+zone|get|per\s+zone)\b/.test(text);

  if (!cabinetsMatch || !traysMatch || !removedMatch || !zonesMatch || !asksForEachZone) {
    return null;
  }

  const numberTokens = extractNumberTokens(text);
  if (numberTokens.length !== 4) {
    return null;
  }

  const cabinets = parsePositiveNumber(cabinetsMatch[1]);
  const traysPerCabinet = parsePositiveNumber(traysMatch[1]);
  const removedTrays = parsePositiveNumber(removedMatch[1]);
  const zones = parsePositiveNumber(zonesMatch[1]);

  if (cabinets === null || traysPerCabinet === null || removedTrays === null || zones === null) {
    return null;
  }

  const total = cabinets * traysPerCabinet;
  const remaining = total - removedTrays;

  if (remaining < 0) {
    return null;
  }

  const answer = formatNumber(remaining / zones);
  const expression = `(${formatNumber(cabinets)} * ${formatNumber(traysPerCabinet)} - ${formatNumber(removedTrays)}) / ${formatNumber(zones)}`;

  return {
    status: 'solved',
    solver: 'supportedWordProblemSolver',
    problem,
    expression,
    answer,
    steps: [
      `Problem: ${problem}`,
      `Extracted expression: ${expression}`,
      `Answer: ${answer}`
    ]
  };
}

function unsupportedProblemResponse(problem) {
  return {
    status: 'rejected',
    solver: 'unsupportedAdvancedProblemGate',
    title: 'Unsupported advanced problem',
    problem,
    message: VERIFIED_SOLVER_MESSAGE,
    answer: VERIFIED_SOLVER_MESSAGE,
    steps: [
      'Unsupported advanced problem',
      VERIFIED_SOLVER_MESSAGE
    ]
  };
}

function solveProblem(problem) {
  return (
    directExpressionSolver(problem) ||
    unsupportedAdvancedProblemGate(problem) ||
    supportedWordProblemSolver(problem) ||
    unsupportedProblemResponse(problem)
  );
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  let problem;

  try {
    problem = JSON.parse(event.body).problem;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  if (!problem || typeof problem !== 'string' || problem.length > 12000) {
    return jsonResponse(400, { error: 'Invalid input' });
  }

  return jsonResponse(200, solveProblem(problem));
};

exports.directExpressionSolver = directExpressionSolver;
exports.supportedWordProblemSolver = supportedWordProblemSolver;
exports.unsupportedAdvancedProblemGate = unsupportedAdvancedProblemGate;
exports.solveProblem = solveProblem;
exports.VERIFIED_SOLVER_MESSAGE = VERIFIED_SOLVER_MESSAGE;
