"""
LANE 1 — Arithmetic Solver (LOCAL_VERIFIED)

Handles pure numeric expressions using a safe AST-based evaluator.
No eval(), no exec(), no external calls.
Supports: + - * / ** % // ( ) integers and decimals.

Returns None if the input is not a pure expression.
"""

import ast
import operator
import re
from typing import Optional
from app.models import SolverResult


# ── Safe operator map ─────────────────────────────────────────────────────────

_OPS = {
    ast.Add:      operator.add,
    ast.Sub:      operator.sub,
    ast.Mult:     operator.mul,
    ast.Div:      operator.truediv,
    ast.Pow:      operator.pow,
    ast.Mod:      operator.mod,
    ast.FloorDiv: operator.floordiv,
    ast.USub:     operator.neg,
    ast.UAdd:     operator.pos,
}

_MAX_POW_BASE    = 1e6   # prevent gigantic exponents
_MAX_POW_EXP     = 100
_RESULT_OVERFLOW = 1e18  # refuse results this large


def _eval_node(node: ast.expr) -> float:
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return float(node.value)
        raise ValueError(f"Non-numeric constant: {node.value!r}")

    if isinstance(node, ast.BinOp):
        op_fn = _OPS.get(type(node.op))
        if op_fn is None:
            raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
        left  = _eval_node(node.left)
        right = _eval_node(node.right)
        # Safety checks for exponentiation
        if isinstance(node.op, ast.Pow):
            if abs(left) > _MAX_POW_BASE or abs(right) > _MAX_POW_EXP:
                raise ValueError("Exponent or base too large")
        if isinstance(node.op, ast.Div) and right == 0:
            raise ValueError("Division by zero")
        result = op_fn(left, right)
        if abs(result) > _RESULT_OVERFLOW:
            raise ValueError("Result overflow")
        return result

    if isinstance(node, ast.UnaryOp):
        op_fn = _OPS.get(type(node.op))
        if op_fn is None:
            raise ValueError(f"Unsupported unary op: {type(node.op).__name__}")
        return op_fn(_eval_node(node.operand))

    raise ValueError(f"Unsupported AST node: {type(node).__name__}")


def _safe_eval(expr: str) -> float:
    """Evaluate a numeric expression safely. Raises ValueError on anything non-numeric."""
    try:
        tree = ast.parse(expr.strip(), mode="eval")
    except SyntaxError as e:
        raise ValueError(f"Syntax error: {e}")
    return _eval_node(tree.body)


def _is_pure_expression(text: str) -> bool:
    """
    Returns True if text looks like a pure numeric expression
    (no letters other than 'e' for scientific notation).
    """
    clean = text.strip()
    # Allow digits, operators, parens, dots, spaces, 'e' for scientific notation
    return bool(re.match(r"^[\d\s\+\-\*\/\%\(\)\.\^eE]+$", clean))


def _format_number(n: float) -> str:
    """Format a float cleanly — integer-like → no decimals, otherwise 10 sig figs."""
    if n == int(n) and abs(n) < 1e15:
        return f"{int(n):,}"
    # 10 significant figures, strip trailing zeros
    formatted = f"{n:.10g}"
    return formatted


def solve(problem: str) -> Optional[SolverResult]:
    """
    Attempt to solve as a pure numeric expression.
    Returns SolverResult on success, None if not applicable.
    """
    # Normalise common Unicode operators
    expr = (
        problem.strip()
        .replace("−", "-")
        .replace("×", "*")
        .replace("÷", "/")
        .replace("^", "**")
    )

    if not _is_pure_expression(expr):
        return None

    try:
        value = _safe_eval(expr)
    except ValueError:
        return None

    answer = _format_number(value)
    steps  = [
        f"Expression: {problem.strip()}",
        f"Result: {answer}",
    ]

    return SolverResult(
        solved            = True,
        answer_summary    = answer,
        solution_markdown = f"**{problem.strip()}** = **{answer}**",
        method            = "arithmetic",
        raw_values        = {"result": value},
        constraint_checks = [f"{problem.strip()} = {answer}"],
    )
