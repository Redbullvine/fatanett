"""
Problem classifier.

Returns one of: simple | medium | advanced | expert

Conservative: when in doubt, escalate.
Simple and medium problems never reach the premium solver.
Advanced and expert problems always go through verification.
"""

import re
from app.models import Classification


# ── Pattern sets (ordered by precedence) ─────────────────────────────────────

_EXPERT = [
    r"\b(multivariable|multi-variable)\b",
    r"\b(partial\s+derivative|partial\s+differentiat)\b",
    r"\b(gradient|divergence|curl|jacobian|hessian|laplacian)\b",
    r"\b(double\s+integral|triple\s+integral|line\s+integral|surface\s+integral)\b",
    r"\b(differential\s+equation|ODE|PDE|initial\s+value\s+problem|IVP|BVP)\b",
    r"\b(fourier\s+series|laplace\s+transform|z.transform)\b",
    r"\b(eigenvalue|eigenvector|diagonaliz)\b",
    r"\b(surface\s+of\s+revolution)\b",
    r"\b(proof|show\s+that|prove\s+that)\b",
    r"\b(taylor\s+series|maclaurin|power\s+series|radius\s+of\s+convergence)\b",
    r"\b(central\s+limit|moment\s+generating|characteristic\s+function)\b",
    r"\b(stokes|green.s\s+theorem|divergence\s+theorem)\b",
]

_ADVANCED = [
    r"\b(minimize|maximize|minimum\s+cost|maximum\s+area|minimum\s+surface|optimal|optimize)\b",
    r"\b(lagrange\s+multiplier|lagrangian)\b",
    r"\b(derivative|differentiate|d/dx|dy/dx)\b",
    r"\b(integral|integrate|antiderivative|area\s+under)\b",
    r"\b(related\s+rates|implicit\s+differentiat)\b",
    # Geometry+calculus combos
    r"\b(volume|surface\s+area).{0,50}(cylinder|cone|sphere|hemisphere|paraboloid|torus)\b",
    r"\b(cylinder|cone|sphere|hemisphere|paraboloid).{0,50}(volume|surface\s+area|cost)\b",
    r"\b(optimization|critical\s+point|second\s+derivative\s+test)\b",
    # Multi-step constraint problems
    r"\$([\d,]+).*\/(m²|ft²|m³)",
    r"\b(constraint|subject\s+to|minimize.{0,60}cost)\b",
    r"\b(calculus|newton.s\s+law|related\s+rate)\b",
    r"\b(work|flux|centroid|moment\s+of\s+inertia)\b",
]

_MEDIUM = [
    r"\b(quadratic|completing\s+the\s+square|discriminant)\b",
    r"\b(system\s+of\s+(equations|inequalities))\b",
    r"\b(polynomial|factor|roots\s+of)\b",
    r"\b(logarithm|ln\(|log\(|exponential\s+(growth|decay))\b",
    r"\b(trigonometric|sine|cosine|tangent).{0,40}(equation|solve|find)\b",
    r"\b(compound\s+interest|present\s+value|future\s+value|amortiz)\b",
    r"\b(probability|permutation|combination|binomial\s+theorem)\b",
    r"\b(matrix|determinant|linear\s+combination)\b",
    r"\b(arithmetic\s+sequence|geometric\s+sequence|summation)\b",
    r"\b(rate|distance|time).{0,60}(same|combined|together)\b",
    r"\b(percent|markup|discount|interest)\b",
]

# Indicators that elevate a simple problem to medium
_WORD_PROBLEM_SIGNALS = [
    r"\$([\d,]+)",
    r"\d+\s*(m²|ft²|m³|ft³|cm²|km²|sq\s*ft|sq\s*m)",
    r"\b(per\s+\w+|per\s+square|per\s+cubic)\b",
    r"\b(cost|price|profit|revenue|budget)\b",
    r"\b(total|remaining|combined|evenly|split|divid)\b",
    r"\b(removed|added|damaged|replaced|spare|leftover)\b",
]


def classify_problem(problem: str) -> Classification:
    """
    Classify a problem by difficulty.

    Hierarchy: expert > advanced > medium > simple
    When ambiguous, escalate — never downgrade.
    """
    t = problem.lower()

    for pat in _EXPERT:
        if re.search(pat, t, re.IGNORECASE):
            return Classification.EXPERT

    for pat in _ADVANCED:
        if re.search(pat, t, re.IGNORECASE):
            return Classification.ADVANCED

    for pat in _MEDIUM:
        if re.search(pat, t, re.IGNORECASE):
            return Classification.MEDIUM

    # Count word-problem signals — two or more means medium
    signal_count = sum(
        1 for pat in _WORD_PROBLEM_SIGNALS
        if re.search(pat, t, re.IGNORECASE)
    )
    if signal_count >= 2:
        return Classification.MEDIUM

    # Long problems are at least medium
    if len(problem.split()) > 40:
        return Classification.MEDIUM

    return Classification.SIMPLE
