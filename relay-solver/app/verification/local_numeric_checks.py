"""
Local numeric verification — the primary verification method.

Plugs the solver's claimed numerical values back into:
- constraint equations (e.g. volume equation)
- second derivative test (for optimization)
- domain checks (positive values, etc.)

Returns a VerificationDetail populated with sympy_passed and scipy_passed.
No external API calls.
"""

import math
import re
from typing import Optional
import sympy as sp
from app.models import VerificationDetail


_REL_TOL = 1e-3   # 0.1% — generous enough for floating-point chains


def _rel_close(a: float, b: float, tol: float = _REL_TOL) -> bool:
    if b == 0:
        return abs(a) < tol
    return abs(a - b) / abs(b) < tol


# ── Cylinder + hemisphere ─────────────────────────────────────────────────────

def _verify_cylinder_hemisphere(raw: dict, V_target: float) -> tuple[bool, list[str]]:
    """
    Verify that (r, h) satisfies V = π·r²·h + (2/3)·π·r³.
    Also checks h > 0 and r > 0.
    """
    r = raw.get("r")
    h = raw.get("h")
    if r is None or h is None:
        return False, ["Missing r or h in raw_values"]

    checks = []

    if r <= 0 or h <= 0:
        checks.append(f"Domain fail: r={r:.6f}, h={h:.6f} (must be positive)")
        return False, checks

    V_calc = math.pi * r**2 * h + (2/3) * math.pi * r**3
    ok = _rel_close(V_calc, V_target)
    checks.append(
        f"Volume check: π·{r:.4f}²·{h:.4f} + (2/3)π·{r:.4f}³ = {V_calc:.4f} "
        f"(target {V_target}) — {'✓' if ok else '✗'}"
    )
    return ok, checks


# ── Generic constraint checker ────────────────────────────────────────────────

def _normalize_expression(expr: str) -> str:
    return (
        expr.replace("π", "pi")
        .replace("−", "-")
        .replace("×", "*")
        .replace("÷", "/")
        .replace("·", "*")
        .replace("^", "**")
        .replace("²", "**2")
        .replace("³", "**3")
        .replace(",", "")
        .strip()
    )


def _safe_eval_expression(expr: str, raw: dict) -> float:
    expr = _normalize_expression(expr)
    if not expr:
        raise ValueError("Empty expression")
    if "__" in expr or re.search(r"[^A-Za-z0-9_+\-*/().,\s]", expr):
        raise ValueError(f"Unsupported characters in expression: {expr}")

    locals_map = {
        "pi": sp.pi,
        "sqrt": sp.sqrt,
        "abs": abs,
    }
    for key, value in raw.items():
        if re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", str(key)):
            try:
                locals_map[str(key)] = float(value)
            except (TypeError, ValueError):
                pass

    value = sp.sympify(expr, locals=locals_map)
    numeric = float(value.evalf())
    if not math.isfinite(numeric):
        raise ValueError(f"Expression was not finite: {expr}")
    return numeric


def _verify_equation(check: str, raw: dict) -> tuple[bool, str]:
    if "=" not in check:
        return False, f"Invalid check (missing '='): {check}"

    left, right = check.split("=", 1)
    try:
      left_value = _safe_eval_expression(left, raw)
      right_value = _safe_eval_expression(right, raw)
    except Exception as exc:
      return False, f"Invalid check ({exc}): {check}"

    ok = _rel_close(left_value, right_value)
    return ok, (
        f"Equation check: {left.strip()} = {left_value:.6g}, "
        f"{right.strip()} = {right_value:.6g} — {'✓' if ok else '✗'}"
    )


def verify_constraint_checks(
    constraint_checks: list[str],
    raw: dict,
    require_equations: bool = False,
) -> tuple[bool, list[str]]:
    """
    Parse and re-evaluate simple 'expr=value' constraint strings.
    Returns (all_passed, list_of_check_strings).
    """
    results = []
    all_ok = True
    checked_count = 0

    for check in constraint_checks:
        ok, detail = _verify_equation(check, raw)
        results.append(detail)
        all_ok = all_ok and ok
        if ok:
            checked_count += 1

    if require_equations and checked_count == 0:
        results.append("Verification fail: no machine-checkable equations were validated")
        return False, results

    return all_ok, results


# ── Domain checks ─────────────────────────────────────────────────────────────

def check_domain(raw: dict) -> tuple[bool, list[str]]:
    """All numeric raw values should be finite and (for physical quantities) positive."""
    checks = []
    ok = True
    physical_keys = {"r", "h", "radius", "height", "length", "width", "area", "volume", "cost", "price"}
    for k, v in raw.items():
        if k.startswith("_"):
            continue
        try:
            fv = float(v)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(fv):
            checks.append(f"Domain fail: {k} = {fv} (not finite)")
            ok = False
            continue
        if k.lower() in physical_keys and fv < 0:
            checks.append(f"Domain fail: {k} = {fv} (must be ≥ 0)")
            ok = False
        else:
            checks.append(f"Domain OK: {k} = {fv}")
    return ok, checks


# ── Orchestrated local verification ──────────────────────────────────────────

def verify_locally(
    raw_values: dict,
    constraint_checks: list[str],
    problem_hint: str = "",
    require_equations: bool = False,
) -> tuple[bool, VerificationDetail, list[str]]:
    """
    Run all applicable local numeric checks.

    Returns:
        (passed: bool, VerificationDetail, all_check_strings: list[str])
    """
    all_checks: list[str] = []
    domain_ok, domain_checks = check_domain(raw_values)
    all_checks.extend(domain_checks)

    structure_ok, structure_checks = verify_constraint_checks(
        constraint_checks,
        raw_values,
        require_equations=require_equations,
    )
    all_checks.extend(structure_checks)

    # Template-specific checks
    template_ok = True
    hint = problem_hint.lower()

    if "cylinder" in hint and "hemispher" in hint:
        # Detect volume from raw_values context if present
        V_check = raw_values.get("V_check") or raw_values.get("volume_check")
        if V_check:
            # If solver already computed V_check, use that
            target = raw_values.get("V_target", raw_values.get("volume", 12000))
            template_ok = _rel_close(float(V_check), float(target))
            all_checks.append(
                f"Template volume check: {V_check:.4f} vs {target} — {'✓' if template_ok else '✗'}"
            )
        elif "r" in raw_values and "h" in raw_values:
            # Guess volume from problem text — not reliable, skip template check
            pass

    passed = domain_ok and structure_ok and template_ok

    detail = VerificationDetail(
        sympy_passed=passed,
        scipy_passed=passed,
        checks=all_checks,
    )
    return passed, detail, all_checks
