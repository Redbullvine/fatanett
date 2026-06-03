"""
Problem classifier — decides which solver pipeline to use.

Levels:
  simple   → Claude direct (arithmetic, one-step algebra)
  medium   → SymPy + Claude explanation
  advanced → SymPy/SciPy required (calculus, optimization, DEs)
"""

import re

# ── Patterns that force the verified solver path ──────────────────────────────

ADVANCED_PATTERNS = [
    # Optimization
    r'\b(minimize|maximize|minimum|maximum|optimal|optimize|least cost|cheapest)\b',
    r'\b(lagrange multiplier|lagrangian)\b',
    # Calculus
    r'\b(derivative|differentiate|integral|integrate|antiderivative)\b',
    r'\b(differential equation|ODE|PDE|initial value)\b',
    r'\b(related rates|implicit differentiat)\b',
    # Geometry with calculus
    r'\b(surface of revolution|volume of revolution|washer|shell method|disk method)\b',
    r'\b(surface area|volume).{0,40}(cylinder|cone|sphere|hemisphere|paraboloid)\b',
    # Multivariable
    r'\b(partial derivative|gradient|divergence|curl|jacobian|hessian)\b',
    r'\b(double integral|triple integral|line integral|surface integral)\b',
    # Series / limits
    r'\b(taylor series|maclaurin|fourier series|power series|radius of convergence)\b',
    r'\b(limit as|l.hopital|l\'hopital)\b',
    # Linear algebra
    r'\b(eigenvalue|eigenvector|matrix invers|determinant of)\b',
    # Probability / stats (advanced)
    r'\b(moment generating|central limit|hypothesis test|confidence interval)\b',
]

MEDIUM_PATTERNS = [
    r'\b(quadratic formula|completing the square)\b',
    r'\b(system of (equations|inequalities))\b',
    r'\b(factor|polynomial|roots of)\b',
    r'\b(logarithm|exponential growth|decay)\b',
    r'\b(trigonometric|sine|cosine|tangent).{0,30}(equation|solve)\b',
    r'\b(percent|interest|compound)\b',
    r'\b(rate|speed|distance|time).{0,30}(problem|word)\b',
]

# ── Word problem indicators (elevate complexity if detected) ──────────────────

WORD_PROBLEM_INDICATORS = [
    r'\$[\d,]+',          # dollar amounts
    r'\d+\s*(m²|ft²|m³|ft³|cm²|km²)',  # area/volume units
    r'\b(per\s+\w+|per\s+square)\b',   # rates
    r'\b(cost|price|profit|revenue)\b', # financial
]


def classify_problem(text: str) -> str:
    """
    Returns 'simple', 'medium', or 'advanced'.
    Conservative: when in doubt, escalate.
    """
    t = text.lower()

    # Check for advanced patterns first (highest priority)
    for pattern in ADVANCED_PATTERNS:
        if re.search(pattern, t, re.IGNORECASE):
            return 'advanced'

    # Check for medium patterns
    for pattern in MEDIUM_PATTERNS:
        if re.search(pattern, t, re.IGNORECASE):
            return 'medium'

    # Word problems with multiple constraints are at least medium
    word_signals = sum(
        1 for p in WORD_PROBLEM_INDICATORS
        if re.search(p, t, re.IGNORECASE)
    )
    if word_signals >= 2:
        return 'medium'

    # Long problems are likely not simple
    if len(text.split()) > 30:
        return 'medium'

    return 'simple'
