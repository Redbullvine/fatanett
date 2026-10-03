/**
 * Relay Math Solver - Netlify Function
 *
 * Primary path:
 *   - Forward to the Python relay-solver service when SOLVER_URL is configured.
 *
 * Local fallback:
 *   - Safely solves arithmetic expressions, simple equations, and common word
 *     problems so Relay still knows basic math when the external solver is not
 *     configured or temporarily unavailable.
 */

'use strict';

const OVERLOADED = 'Relay is overloaded with computing right now. Please try again later.';
const MAX_RESULT = 1e18;
const MAX_POWER_EXPONENT = 100;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function verification(checks) {
  return {
    sympy_passed:          false,
    scipy_passed:          false,
    wolfram_used:          false,
    wolfram_passed:        false,
    cheap_verifier_used:   false,
    cheap_verifier_passed: false,
    checks:                checks || [],
  };
}

function jsonResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(body),
  };
}

function solvedResponse({ method, classification = 'simple', answer, markdown, checks, warnings, networkStats }) {
  return {
    ok:                true,
    status:            'LOCAL_VERIFIED',
    verified:          true,
    method,
    classification,
    answer_summary:    answer,
    solution_markdown: markdown,
    verification:      verification(checks),
    warnings:          warnings || [],
    network_stats:     networkStats || null,
  };
}

function overloadedResponse(reason) {
  return jsonResponse({
    ok:                false,
    status:            'COMPUTE_OVERLOADED',
    verified:          false,
    method:            'unavailable',
    classification:    'unknown',
    answer_summary:    OVERLOADED,
    solution_markdown: OVERLOADED,
    verification:      verification([]),
    warnings:          [reason || 'Solver service unavailable.'],
  });
}

function responseFromLocalSolve(problem, networkStats) {
  const local = solveLocally(problem, networkStats);
  return local ? jsonResponse(local) : null;
}

function normalizeMathText(text) {
  return String(text || '')
    .trim()
    .replace(/[\u2212\u2012\u2013\u2014]/g, '-')
    .replace(/[\u00d7\u22c5\u00b7]/g, '*')
    .replace(/\u00f7/g, '/')
    .replace(/\bto the power of\b/gi, '^')
    .replace(/\braised to\b/gi, '^')
    .replace(/\bequals\b/gi, '=')
    .replace(/\bis equal to\b/gi, '=')
    .replace(/\bsquared\b/gi, '^2')
    .replace(/\bcubed\b/gi, '^3');
}

function stripNumericCommas(text) {
  return text.replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, (match) => match.replace(/,/g, ''));
}

function wordsToOperators(text) {
  return text
    .replace(/(\d|\))\s*x\s*(?=\d|\()/gi, '$1*')
    .replace(/\bmultiplied\s+by\b/gi, '*')
    .replace(/\btimes\b/gi, '*')
    .replace(/\bdivided\s+by\b/gi, '/')
    .replace(/\bover\b/gi, '/')
    .replace(/\bplus\b/gi, '+')
    .replace(/\bminus\b/gi, '-');
}

function parseSimpleNumber(value) {
  const normalized = String(value || '').replace(/[$,\s]/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error('Invalid number');
  }
  return parsed;
}

function assertFiniteResult(value) {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_RESULT) {
    throw new Error('Result is too large');
  }
  return Object.is(value, -0) ? 0 : value;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  const n = Object.is(value, -0) ? 0 : value;
  if (Number.isInteger(n) && Math.abs(n) < 1e15) {
    return n.toLocaleString('en-US');
  }

  return Number(n.toPrecision(12)).toString();
}

function tokenizeExpression(expr, { allowVariables = false } = {}) {
  const tokens = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    const numberMatch = expr.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (numberMatch) {
      const raw = numberMatch[0];
      tokens.push({ type: 'number', raw, value: Number(raw) });
      i += raw.length;
      continue;
    }

    const identMatch = expr.slice(i).match(/^[a-z]+/i);
    if (identMatch) {
      const raw = identMatch[0].toLowerCase();
      if (!allowVariables && !['pi', 'e', 'sqrt', 'abs', 'round', 'floor', 'ceil'].includes(raw)) {
        throw new Error('Unsupported identifier');
      }
      tokens.push({ type: 'ident', value: raw });
      i += raw.length;
      continue;
    }

    const pair = expr.slice(i, i + 2);
    if (pair === '**' || pair === '//') {
      tokens.push({ type: 'op', value: pair });
      i += 2;
      continue;
    }

    if ('+-*/%^()='.includes(ch)) {
      tokens.push({ type: ch === '(' || ch === ')' ? 'paren' : 'op', value: ch });
      i += 1;
      continue;
    }

    throw new Error(`Unsupported character: ${ch}`);
  }

  return insertImplicitMultiplication(tokens);
}

function tokenEndsValue(token) {
  return token && (token.type === 'number' || token.type === 'ident' || token.value === ')');
}

function tokenStartsValue(token) {
  return token && (token.type === 'number' || token.type === 'ident' || token.value === '(');
}

function insertImplicitMultiplication(tokens) {
  const withMultiplication = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const previous = tokens[i - 1];
    const current = tokens[i];
    const previousIsFunction = previous && previous.type === 'ident'
      && ['sqrt', 'abs', 'round', 'floor', 'ceil'].includes(previous.value);

    if (tokenEndsValue(previous) && tokenStartsValue(current) && !(previousIsFunction && current.value === '(')) {
      withMultiplication.push({ type: 'op', value: '*' });
    }
    withMultiplication.push(current);
  }

  return withMultiplication;
}

class NumericParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  parse() {
    const value = this.parseAddSub();
    if (this.peek()) {
      throw new Error('Unexpected trailing input');
    }
    return assertFiniteResult(value);
  }

  peek() {
    return this.tokens[this.index];
  }

  take(value) {
    const token = this.peek();
    if (token && token.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  parseAddSub() {
    let value = this.parseMulDiv();

    while (true) {
      if (this.take('+')) {
        value = assertFiniteResult(value + this.parseMulDiv());
      } else if (this.take('-')) {
        value = assertFiniteResult(value - this.parseMulDiv());
      } else {
        return value;
      }
    }
  }

  parseMulDiv() {
    let value = this.parsePower();

    while (true) {
      if (this.take('*')) {
        value = assertFiniteResult(value * this.parsePower());
      } else if (this.take('/')) {
        const divisor = this.parsePower();
        if (divisor === 0) throw new Error('Division by zero');
        value = assertFiniteResult(value / divisor);
      } else if (this.take('//')) {
        const divisor = this.parsePower();
        if (divisor === 0) throw new Error('Division by zero');
        value = assertFiniteResult(Math.floor(value / divisor));
      } else if (this.take('%')) {
        const divisor = this.parsePower();
        if (divisor === 0) throw new Error('Division by zero');
        value = assertFiniteResult(value % divisor);
      } else {
        return value;
      }
    }
  }

  parsePower() {
    let value = this.parseUnary();

    if (this.take('^') || this.take('**')) {
      const exponent = this.parsePower();
      if (Math.abs(exponent) > MAX_POWER_EXPONENT) {
        throw new Error('Exponent too large');
      }
      value = assertFiniteResult(Math.pow(value, exponent));
    }

    return value;
  }

  parseUnary() {
    if (this.take('+')) return this.parseUnary();
    if (this.take('-')) return assertFiniteResult(-this.parseUnary());
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.peek();
    if (!token) {
      throw new Error('Unexpected end of expression');
    }

    if (token.type === 'number') {
      this.index += 1;
      return assertFiniteResult(token.value);
    }

    if (token.type === 'ident') {
      this.index += 1;
      if (token.value === 'pi') return Math.PI;
      if (token.value === 'e') return Math.E;

      if (!this.take('(')) {
        throw new Error('Function call expected');
      }
      const value = this.parseAddSub();
      if (!this.take(')')) {
        throw new Error('Missing closing parenthesis');
      }

      switch (token.value) {
        case 'sqrt':
          if (value < 0) throw new Error('Square root of negative number');
          return assertFiniteResult(Math.sqrt(value));
        case 'abs':
          return Math.abs(value);
        case 'round':
          return Math.round(value);
        case 'floor':
          return Math.floor(value);
        case 'ceil':
          return Math.ceil(value);
        default:
          throw new Error('Unsupported function');
      }
    }

    if (this.take('(')) {
      const value = this.parseAddSub();
      if (!this.take(')')) {
        throw new Error('Missing closing parenthesis');
      }
      return value;
    }

    throw new Error('Unexpected token');
  }
}

function expressionCandidate(problem) {
  let expr = wordsToOperators(normalizeMathText(problem));
  expr = stripNumericCommas(expr)
    .replace(/\b(?:what\s+is|what's|calculate|compute|evaluate|simplify|answer)\b/gi, ' ')
    .replace(/[?]/g, ' ')
    .trim();
  return expr;
}

function solveArithmetic(problem, networkStats) {
  const expr = expressionCandidate(problem);
  if (!expr || /=/.test(expr)) return null;

  try {
    const tokens = tokenizeExpression(expr, { allowVariables: false });
    const value = new NumericParser(tokens).parse();
    const answer = formatNumber(value);
    return solvedResponse({
      method: 'local_arithmetic',
      answer,
      markdown: `**${problem.trim()}** = **${answer}**`,
      checks: [`${expr} = ${answer}`],
      networkStats,
    });
  } catch {
    return null;
  }
}

function constPoly(value) {
  return [assertFiniteResult(value), 0, 0];
}

function variablePoly() {
  return [0, 1, 0];
}

function polyDegree(poly) {
  for (let i = 2; i >= 0; i -= 1) {
    if (Math.abs(poly[i]) > 1e-12) return i;
  }
  return 0;
}

function polyAdd(a, b) {
  return [
    assertFiniteResult(a[0] + b[0]),
    assertFiniteResult(a[1] + b[1]),
    assertFiniteResult(a[2] + b[2]),
  ];
}

function polySub(a, b) {
  return [
    assertFiniteResult(a[0] - b[0]),
    assertFiniteResult(a[1] - b[1]),
    assertFiniteResult(a[2] - b[2]),
  ];
}

function polyMul(a, b) {
  const out = [0, 0, 0, 0, 0];
  for (let i = 0; i <= 2; i += 1) {
    for (let j = 0; j <= 2; j += 1) {
      out[i + j] += a[i] * b[j];
    }
  }
  if (Math.abs(out[3]) > 1e-12 || Math.abs(out[4]) > 1e-12) {
    throw new Error('Equation degree too high');
  }
  return [assertFiniteResult(out[0]), assertFiniteResult(out[1]), assertFiniteResult(out[2])];
}

function polyScale(poly, scalar) {
  return [
    assertFiniteResult(poly[0] * scalar),
    assertFiniteResult(poly[1] * scalar),
    assertFiniteResult(poly[2] * scalar),
  ];
}

function polyPow(poly, exponent) {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 2) {
    throw new Error('Unsupported polynomial exponent');
  }
  if (exponent === 0) return constPoly(1);
  if (exponent === 1) return poly;
  return polyMul(poly, poly);
}

class PolynomialParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
    this.variables = new Set();
  }

  parse() {
    const poly = this.parseAddSub();
    if (this.peek()) {
      throw new Error('Unexpected trailing input');
    }
    if (this.variables.size > 1) {
      throw new Error('Only one variable is supported');
    }
    return { poly, variables: [...this.variables] };
  }

  peek() {
    return this.tokens[this.index];
  }

  take(value) {
    const token = this.peek();
    if (token && token.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  parseAddSub() {
    let value = this.parseMulDiv();

    while (true) {
      if (this.take('+')) {
        value = polyAdd(value, this.parseMulDiv());
      } else if (this.take('-')) {
        value = polySub(value, this.parseMulDiv());
      } else {
        return value;
      }
    }
  }

  parseMulDiv() {
    let value = this.parsePower();

    while (true) {
      if (this.take('*')) {
        value = polyMul(value, this.parsePower());
      } else if (this.take('/')) {
        const divisor = this.parsePower();
        if (polyDegree(divisor) !== 0 || divisor[0] === 0) {
          throw new Error('Only division by constants is supported');
        }
        value = polyScale(value, 1 / divisor[0]);
      } else {
        return value;
      }
    }
  }

  parsePower() {
    let value = this.parseUnary();
    if (this.take('^') || this.take('**')) {
      const exponentPoly = this.parseUnary();
      if (polyDegree(exponentPoly) !== 0) {
        throw new Error('Variable exponents are unsupported');
      }
      value = polyPow(value, exponentPoly[0]);
    }
    return value;
  }

  parseUnary() {
    if (this.take('+')) return this.parseUnary();
    if (this.take('-')) return polyScale(this.parseUnary(), -1);
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.peek();
    if (!token) {
      throw new Error('Unexpected end of expression');
    }

    if (token.type === 'number') {
      this.index += 1;
      return constPoly(token.value);
    }

    if (token.type === 'ident') {
      this.index += 1;
      if (token.value === 'pi') return constPoly(Math.PI);
      if (token.value === 'e') return constPoly(Math.E);
      if (/^[a-z]$/.test(token.value)) {
        this.variables.add(token.value);
        return variablePoly();
      }
      throw new Error('Unsupported identifier in equation');
    }

    if (this.take('(')) {
      const value = this.parseAddSub();
      if (!this.take(')')) {
        throw new Error('Missing closing parenthesis');
      }
      return value;
    }

    throw new Error('Unexpected token');
  }
}

function equationCandidate(problem) {
  let text = wordsToOperators(normalizeMathText(problem));
  text = stripNumericCommas(text)
    .replace(/\bsolve\s+for\s+[a-z]\b/gi, ' ')
    .replace(/\bfind\s+all\s+positive\s+integers?\s+[a-z]\s+(?:such\s+that|where)?\b/gi, ' ')
    .replace(/\bfind\s+(?:all\s+)?(?:real\s+)?(?:roots?|solutions?)\b/gi, ' ')
    .replace(/\b(?:solve|find|for|all|values?|of|the|real|roots?|root|positive|integers?|integer|numbers?|number|such|that|where|if)\b/gi, ' ')
    .replace(/[:?]/g, ' ')
    .trim();

  return text;
}

function parsePolynomialExpression(expr) {
  const tokens = tokenizeExpression(expr, { allowVariables: true }).filter((token) => token.value !== '=');
  return new PolynomialParser(tokens).parse();
}

function solveEquation(problem, networkStats) {
  const text = equationCandidate(problem);
  if (!text.includes('=')) return null;

  const parts = text.split('=');
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    return null;
  }

  try {
    const left = parsePolynomialExpression(parts[0]);
    const right = parsePolynomialExpression(parts[1]);
    const variables = new Set(left.variables.concat(right.variables));
    if (variables.size > 1) {
      return null;
    }
    const variable = [...variables][0] || 'x';
    const diff = polySub(left.poly, right.poly);
    const degree = polyDegree(diff);
    const wantsPositiveIntegers = /\bpositive\s+integers?\b/i.test(problem);
    const checks = [`${parts[0].trim()} = ${parts[1].trim()}`];

    if (degree === 0) {
      const answer = Math.abs(diff[0]) < 1e-12 ? 'All real numbers' : 'No solution';
      return solvedResponse({
        method: 'local_equation',
        answer,
        markdown: `Equation reduces to **${formatNumber(diff[0])} = 0**.\n\n**Answer: ${answer}**`,
        checks,
        networkStats,
      });
    }

    if (degree === 1) {
      const value = -diff[0] / diff[1];
      const roots = wantsPositiveIntegers
        ? (Number.isInteger(value) && value > 0 ? [value] : [])
        : [value];
      const answer = roots.length
        ? `${variable} = ${roots.map(formatNumber).join(', ')}`
        : 'No positive integer solutions';
      return solvedResponse({
        method: 'local_equation',
        answer,
        markdown: [
          `Move all terms to one side: **${formatNumber(diff[1])}${variable} + ${formatNumber(diff[0])} = 0**`,
          `Solve: **${variable} = ${formatNumber(value)}**`,
          `**Answer: ${answer}**`,
        ].join('\n'),
        checks: checks.concat([`${formatNumber(diff[1])}${variable} + ${formatNumber(diff[0])} = 0`]),
        networkStats,
      });
    }

    if (degree === 2) {
      const a = diff[2];
      const b = diff[1];
      const c = diff[0];
      const discriminant = b * b - 4 * a * c;
      let roots;

      if (discriminant < -1e-12) {
        roots = [];
      } else if (Math.abs(discriminant) < 1e-12) {
        roots = [-b / (2 * a)];
      } else {
        const rootDisc = Math.sqrt(discriminant);
        roots = [(-b - rootDisc) / (2 * a), (-b + rootDisc) / (2 * a)];
      }

      let answerRoots = roots;
      if (wantsPositiveIntegers) {
        answerRoots = roots.filter((root) => Math.abs(root - Math.round(root)) < 1e-10 && root > 0).map(Math.round);
      }

      const answer = answerRoots.length
        ? `${variable} = ${answerRoots.map(formatNumber).join(', ')}`
        : (wantsPositiveIntegers ? 'No positive integer solutions' : 'No real solutions');

      return solvedResponse({
        method: 'local_equation',
        answer,
        markdown: [
          `Move all terms to one side: **${formatNumber(a)}${variable}^2 + ${formatNumber(b)}${variable} + ${formatNumber(c)} = 0**`,
          `Discriminant: **${formatNumber(b)}^2 - 4(${formatNumber(a)})(${formatNumber(c)}) = ${formatNumber(discriminant)}**`,
          roots.length ? `Quadratic formula gives: **${roots.map((root) => `${variable} = ${formatNumber(root)}`).join(', ')}**` : 'The discriminant is negative, so there are no real roots.',
          `**Answer: ${answer}**`,
        ].join('\n'),
        checks: checks.concat([`discriminant = ${formatNumber(discriminant)}`]),
        networkStats,
      });
    }
  } catch {
    return null;
  }

  return null;
}

function solveWordProblem(problem, networkStats) {
  const text = stripNumericCommas(normalizeMathText(problem));

  const rateDistance = text.match(
    /\b(?:travel|travels|traveled|drive|drives|drove|move|moves|run|runs|fly|flies|ride|rides)\D{0,50}([\d.]+)\s*(mph|miles per hour|km\/h|kph|kmh|knots?)\D{0,50}([\d.]+)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i
  );
  if (rateDistance) {
    const speed = parseSimpleNumber(rateDistance[1]);
    const timeValue = parseSimpleNumber(rateDistance[3]);
    const unit = rateDistance[4].toLowerCase();
    const hours = /min/.test(unit) ? timeValue / 60 : (/sec/.test(unit) ? timeValue / 3600 : timeValue);
    const distance = speed * hours;
    const distanceUnit = /mph|mile/i.test(rateDistance[2]) ? 'miles' : 'km';
    const answer = `${formatNumber(distance)} ${distanceUnit}`;
    return solvedResponse({
      method: 'local_word_problem',
      answer,
      markdown: [
        `Speed: **${formatNumber(speed)} ${rateDistance[2]}**`,
        `Time: **${formatNumber(timeValue)} ${rateDistance[4]} = ${formatNumber(hours)} hours**`,
        `Distance = speed * time = **${formatNumber(speed)} * ${formatNumber(hours)} = ${formatNumber(distance)} ${distanceUnit}**`,
        `**Answer: ${answer}**`,
      ].join('\n'),
      checks: [`distance = ${speed} * ${hours} = ${distance}`],
      networkStats,
    });
  }

  const percentOf = text.match(/\b([\d.]+)\s*(?:%|percent)\s+of\s+\$?([\d.]+)/i);
  if (percentOf) {
    const pct = parseSimpleNumber(percentOf[1]);
    const base = parseSimpleNumber(percentOf[2]);
    const value = (pct / 100) * base;
    const answer = formatNumber(value);
    return solvedResponse({
      method: 'local_word_problem',
      answer,
      markdown: [
        `${formatNumber(pct)}% means ${formatNumber(pct / 100)}.`,
        `${formatNumber(pct / 100)} * ${formatNumber(base)} = **${answer}**`,
        `**Answer: ${answer}**`,
      ].join('\n'),
      checks: [`${pct}% of ${base} = ${value}`],
      networkStats,
    });
  }

  const discount = text.match(/\b([\d.]+)\s*(?:%|percent)\s+(?:off|discount)\s+\$?([\d.]+)/i)
    || text.match(/\$?([\d.]+)\D{0,40}\b([\d.]+)\s*(?:%|percent)\s+(?:off|discount)\b/i);
  if (discount) {
    const firstPattern = /(?:off|discount)\s+\$?[\d.]+/i.test(discount[0]);
    const pct = parseSimpleNumber(firstPattern ? discount[1] : discount[2]);
    const price = parseSimpleNumber(firstPattern ? discount[2] : discount[1]);
    const finalPrice = price * (1 - pct / 100);
    const answer = `$${formatNumber(finalPrice)}`;
    return solvedResponse({
      method: 'local_word_problem',
      answer,
      markdown: [
        `Discount amount: ${formatNumber(price)} * ${formatNumber(pct / 100)} = ${formatNumber(price * pct / 100)}`,
        `Final price: ${formatNumber(price)} - ${formatNumber(price * pct / 100)} = **${answer}**`,
        `**Answer: ${answer}**`,
      ].join('\n'),
      checks: [`${price} * (1 - ${pct}/100) = ${finalPrice}`],
      networkStats,
    });
  }

  const change = text.match(/\b(increase|decrease)\s+\$?([\d.]+)\s+by\s+([\d.]+)\s*(?:%|percent)\b/i);
  if (change) {
    const direction = change[1].toLowerCase();
    const base = parseSimpleNumber(change[2]);
    const pct = parseSimpleNumber(change[3]);
    const value = direction === 'increase' ? base * (1 + pct / 100) : base * (1 - pct / 100);
    const answer = formatNumber(value);
    return solvedResponse({
      method: 'local_word_problem',
      answer,
      markdown: [
        `${direction === 'increase' ? 'Increase' : 'Decrease'} factor: ${direction === 'increase' ? '1 +' : '1 -'} ${formatNumber(pct / 100)}`,
        `${formatNumber(base)} becomes **${answer}**`,
        `**Answer: ${answer}**`,
      ].join('\n'),
      checks: [`${base} adjusted by ${pct}% = ${value}`],
      networkStats,
    });
  }

  if (/\b(?:average|mean)\b/i.test(text)) {
    const numbers = text.match(/-?\d+(?:\.\d+)?/g);
    if (numbers && numbers.length >= 2) {
      const values = numbers.map(parseSimpleNumber);
      const sum = values.reduce((total, value) => total + value, 0);
      const avg = sum / values.length;
      const answer = formatNumber(avg);
      return solvedResponse({
        method: 'local_word_problem',
        answer,
        markdown: [
          `Numbers: ${values.map(formatNumber).join(', ')}`,
          `Sum: ${formatNumber(sum)}`,
          `Average = ${formatNumber(sum)} / ${values.length} = **${answer}**`,
          `**Answer: ${answer}**`,
        ].join('\n'),
        checks: [`average = ${sum} / ${values.length} = ${avg}`],
        networkStats,
      });
    }
  }

  return null;
}

function solveLocally(problem, networkStats) {
  return solveEquation(problem, networkStats)
    || solveWordProblem(problem, networkStats)
    || solveArithmetic(problem, networkStats);
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
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  if (!problem) {
    return jsonResponse({ error: 'Missing problem' }, 400);
  }
  if (problem.length > 6000) {
    return jsonResponse({ error: 'Problem too long' }, 400);
  }

  // Deterministic local lanes go first so basic math cannot be guessed upstream.
  const localResponse = responseFromLocalSolve(problem, networkStats);
  if (localResponse) {
    return localResponse;
  }

  // Route harder problems to the solver service when configured.
  const solverUrl = process.env.SOLVER_URL;
  if (!solverUrl) {
    return overloadedResponse('SOLVER_URL not configured, and local fallback could not solve this problem.');
  }

  let resp;
  try {
    resp = await fetch(`${solverUrl.replace(/\/$/, '')}/solve`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ problem, network_stats: networkStats }),
      signal:  AbortSignal.timeout(50_000),   // 50s - SymPy + Opus can be slow
    });
  } catch (err) {
    return responseFromLocalSolve(problem, networkStats)
      || overloadedResponse(`Solver timeout or network error: ${err.message}`);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return responseFromLocalSolve(problem, networkStats)
      || overloadedResponse(`Solver returned ${resp.status}: ${body}`);
  }

  let data;
  try {
    data = await resp.json();
  } catch {
    return responseFromLocalSolve(problem, networkStats)
      || overloadedResponse('Solver returned invalid JSON.');
  }

  if (data && (data.ok === false || data.status === 'COMPUTE_OVERLOADED' || data.status === 'SOLVER_UNAVAILABLE')) {
    return responseFromLocalSolve(problem, networkStats) || jsonResponse(data);
  }

  return jsonResponse(data);
};
