"""
Verification orchestrator.

Runs the full verification pipeline on a SolverResult:
  1. Local numeric checks (SymPy/SciPy substitution) — always
  2. Wolfram Alpha API — when ENABLE_WOLFRAM_VERIFICATION=true and WOLFRAM_APP_ID set
  3. Cheap model review — backup, when above agree or one is inconclusive

Decision matrix:
  - If local check passes AND (Wolfram passes OR Wolfram inconclusive):
      → verified = True
  - If local check fails:
      → verified = False  (Wolfram/cheap are still run for logs)
  - If cheap verifier flags errors AND local passes:
      → verified = False  (cheap verifier has veto)
"""

import os

from app.models import SolverResult, VerificationDetail
from app.verification.local_numeric_checks import verify_locally
from app.verification.wolfram_client import verify_optimization_result
from app.verification.cheap_model_verifier import verify as cheap_verify


async def run_verification(
    problem: str,
    solver_result: SolverResult,
) -> tuple[bool, VerificationDetail]:
    """
    Orchestrate verification.

    Returns:
        (verified: bool, VerificationDetail)
    """
    detail = VerificationDetail()
    all_checks: list[str] = []

    # ── Step 1: Local numeric checks ─────────────────────────────────────────
    local_passed, local_detail, local_checks = verify_locally(
        solver_result.raw_values,
        solver_result.constraint_checks,
        problem_hint=problem,
    )
    detail.sympy_passed = local_detail.sympy_passed
    detail.scipy_passed = local_detail.scipy_passed
    all_checks.extend(local_checks)

    # ── Step 2: Wolfram Alpha (optional) ────────────────────────────────────
    wolfram_passed = False
    wolfram_inconclusive = True

    wolfram_result = await verify_optimization_result(solver_result.raw_values)
    detail.wolfram_used   = wolfram_result["used"]
    detail.wolfram_passed = wolfram_result["passed"]
    wolfram_passed        = wolfram_result["passed"]
    wolfram_inconclusive  = not wolfram_result["used"] or (
        wolfram_result["used"] and not wolfram_result["passed"]
        and len(wolfram_result.get("checks", [])) == 0
    )
    all_checks.extend(wolfram_result.get("checks", []))

    # ── Step 3: Cheap model verifier ────────────────────────────────────────
    cheap_result = {"used": False, "passed": True, "errors": []}

    # Only call cheap verifier if local check passed (no point reviewing garbage)
    if local_passed and solver_result.raw_values:
        cheap_result = await cheap_verify(
            problem,
            solver_result.solution_markdown,
            solver_result.raw_values,
        )

    detail.cheap_verifier_used   = cheap_result["used"]
    detail.cheap_verifier_passed = cheap_result["passed"]
    if cheap_result.get("errors"):
        all_checks.extend([f"Cheap verifier: {e}" for e in cheap_result["errors"]])

    detail.checks = all_checks

    # ── Decision ─────────────────────────────────────────────────────────────
    # Local must pass
    if not local_passed:
        return False, detail

    # Cheap verifier has veto power
    if cheap_result["used"] and not cheap_result["passed"]:
        return False, detail

    # Wolfram: pass or inconclusive is OK; only fail blocks
    if detail.wolfram_used and not detail.wolfram_passed and not wolfram_inconclusive:
        return False, detail

    return True, detail
