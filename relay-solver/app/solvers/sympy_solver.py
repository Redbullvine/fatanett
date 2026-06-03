"""
LANE 2 — SymPy Symbolic Solver (LOCAL_SYMBOLIC_VERIFIED)

Handles medium-difficulty problems that can be expressed symbolically:
- single-variable equations
- simple derivatives
- simple definite integrals
- basic optimization (one variable)

Uses a safe restricted namespace (no OS, no network).
Claude generates the SymPy code; we execute it here.
"""

import ast
import math
import traceback
from typing import Any, Optional

import numpy as np
import sympy as sp
from sympy import (
    Eq, N, Rational, S, diff, exp, expand, factor, integrate, log,
    oo, pi, simplify, solve, sqrt, symbols, asin, acos, atan,
    sin, cos, tan, Matrix, linsolve, solveset,
)
from scipy.optimize import minimize as scipy_minimize, minimize_scalar

from app.models import SolverResult


# ── Safe execution environment ────────────────────────────────────────────────

_ALLOWED_IMPORT_ROOTS = {"sympy", "scipy", "numpy", "math"}
_FORBIDDEN_NAMES = {
    "eval", "exec", "compile", "__import__", "open", "os", "sys",
    "subprocess", "shutil", "socket", "requests", "httpx",
    "importlib", "builtins", "globals", "locals", "vars", "dir",
    "getattr", "setattr", "delattr",
}
_SAFE_BUILTINS: dict[str, Any] = {
    "abs": abs, "round": round, "range": range, "len": len,
    "list": list, "dict": dict, "tuple": tuple, "set": set,
    "float": float, "int": int, "str": str, "bool": bool,
    "max": max, "min": min, "sum": sum, "sorted": sorted,
    "enumerate": enumerate, "zip": zip, "map": map, "filter": filter,
    "print": print,
    "True": True, "False": False, "None": None,
    "ValueError": ValueError, "TypeError": TypeError, "Exception": Exception,
}


def _ast_safety_check(code: str) -> None:
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        raise ValueError(f"Syntax error: {e}")
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id in _FORBIDDEN_NAMES:
            raise ValueError(f"Forbidden name: {node.id}")
        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise ValueError(f"Forbidden dunder: {node.attr}")
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = (
                [a.name for a in node.names]
                if isinstance(node, ast.Import)
                else [node.module or ""]
            )
            for name in names:
                if name.split(".")[0] not in _ALLOWED_IMPORT_ROOTS:
                    raise ValueError(f"Forbidden import: {name}")


def _build_namespace() -> dict[str, Any]:
    return {
        "__builtins__": _SAFE_BUILTINS,
        "sp": sp, "symbols": symbols, "solve": solve, "solveset": solveset,
        "diff": diff, "integrate": integrate, "simplify": simplify,
        "expand": expand, "factor": factor, "N": N, "Rational": Rational,
        "Eq": Eq, "Matrix": Matrix, "linsolve": linsolve,
        "pi": pi, "sqrt": sqrt, "exp": exp, "log": log,
        "sin": sin, "cos": cos, "tan": tan,
        "asin": asin, "acos": acos, "atan": atan,
        "oo": oo, "S": S,
        "np": np,
        "scipy_minimize": scipy_minimize,
        "minimize_scalar": minimize_scalar,
        "math": math,
    }


def execute_solver_code(code: str) -> dict:
    """
    Execute SymPy solver code in a sandboxed namespace.
    The code must set RESULT = { answer, steps, verified, raw }.
    """
    _ast_safety_check(code)
    ns = _build_namespace()
    try:
        exec(compile(code, "<sympy_solver>", "exec"), ns)  # noqa: S102
    except Exception as e:
        raise RuntimeError(f"Execution error: {e}")
    result = ns.get("RESULT")
    if result is None:
        raise RuntimeError("Solver code did not set RESULT")
    if not isinstance(result, dict):
        raise RuntimeError(f"RESULT must be dict, got {type(result)}")
    if "answer" not in result or "steps" not in result:
        raise RuntimeError("RESULT must have 'answer' and 'steps'")
    return result


def solve_from_code(code: str) -> Optional[SolverResult]:
    """
    Run Claude-generated SymPy code and convert the RESULT dict to SolverResult.
    Returns None on any error so the pipeline can escalate.
    """
    try:
        raw = execute_solver_code(code)
    except Exception as e:
        return None

    verified = bool(raw.get("verified", False))
    return SolverResult(
        solved            = True,
        answer_summary    = str(raw.get("answer", "")),
        solution_markdown = str(raw.get("answer", "")),
        method            = "sympy",
        raw_values        = raw.get("raw", {}),
        constraint_checks = raw.get("constraint_checks", []),
        warnings          = [] if verified else ["SymPy solution not self-verified"],
    )
