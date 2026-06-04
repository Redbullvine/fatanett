"""Tests for premium escalation rules — no Opus for cheap problems."""

import pytest
import asyncio
from app.classifier import classify_problem, unsupported_for_verified_numeric_solver
from app.main import solve as solve_endpoint
from app.models import Classification, SolveRequest, SolverStatus
from app.solvers import arithmetic_solver, word_problem_solver, template_solver


# ── Classifier tests ──────────────────────────────────────────────────────────

def test_simple_arithmetic_classified_simple():
    assert classify_problem("2 + 2") == Classification.SIMPLE

def test_expression_classified_simple():
    assert classify_problem("(137 + 423) * 7 / 3") == Classification.SIMPLE

def test_fiber_tray_classified_medium_or_simple():
    c = classify_problem(
        "A fiber crew installs the same number of splice trays in 7 cabinets. "
        "Each cabinet gets 18 trays. Later, 9 trays are removed. "
        "Split between 3 zones."
    )
    assert c in (Classification.SIMPLE, Classification.MEDIUM)

def test_wastewater_classified_advanced():
    c = classify_problem(
        "A wastewater pond is a cylinder with hemispherical cap, volume 12000 m³. "
        "Cylinder walls $45/m², hemisphere $80/m². Minimize cost."
    )
    assert c == Classification.ADVANCED

def test_derivative_classified_advanced():
    assert classify_problem("find the derivative of x^3 + 2x") == Classification.ADVANCED

def test_de_classified_expert():
    assert classify_problem("Solve the ODE dy/dx + 2y = e^x") == Classification.EXPERT

def test_multivariable_classified_expert():
    assert classify_problem("Find the gradient of f(x,y) = x^2 + y^2") == Classification.EXPERT

def test_proof_prompt_is_unsupported_for_numeric_verifier():
    reasons = unsupported_for_verified_numeric_solver(
        "Let p be an odd prime. Prove that there are infinitely many positive integers n "
        "such that p divides n^(2^(p-1)) - 2."
    )
    assert reasons

def test_multi_problem_prompt_is_unsupported_for_numeric_verifier():
    reasons = unsupported_for_verified_numeric_solver(
        "Prove the theorem. Alternatively, find all positive integers n such that f(n) divides n^2025 - 1."
    )
    assert len(reasons) >= 2

def test_relay_rejects_combined_proof_and_computational_prompt():
    problem = (
        "Let $ p $ be an odd prime. Prove that there are infinitely many positive integers $ n $ such that "
        "$ p $ divides $ n^{2^{p-1}} - 2 $, but $ p $ does not divide $ n^{2^k} - 2 $ for any $ k < p-1 $. "
        "(Alternatively, if you want something more computational that still requires serious reasoning:) "
        "Harder computational version: Find all positive integers n such that "
        "n^5 + n^4 + n^3 + n^2 + n + 1 divides n^2025 - 1."
    )

    response = asyncio.run(solve_endpoint(SolveRequest(problem=problem)))

    assert response.ok is True
    assert response.verified is True
    assert response.status == SolverStatus.COUNTEREXAMPLE_FOUND
    assert response.method == "bundled_counterexample_check"
    assert "The statement is false as written" in response.answer_summary
    assert "p = 3" in response.solution_markdown
    assert response.status != SolverStatus.VERIFIED_PREMIUM

def test_exhaustive_integer_search_without_deterministic_solver_is_unsupported():
    problem = (
        "Find all positive integers n such that "
        "n^5 + n^4 + n^3 + n^2 + n + 1 divides n^2025 - 1."
    )

    response = asyncio.run(solve_endpoint(SolveRequest(problem=problem)))

    assert response.ok is False
    assert response.verified is False
    assert response.status == SolverStatus.UNSUPPORTED_PROOF_VERIFICATION
    assert "overloaded" in response.answer_summary.lower()


# ── Solver routing: simple/medium never needs Opus ────────────────────────────

def test_arithmetic_does_not_need_opus():
    """Pure arithmetic must be solved locally — Opus should never be called."""
    r = arithmetic_solver.solve("2 + 2")
    assert r is not None and r.solved
    assert r.method == "arithmetic"

def test_word_problem_does_not_need_opus():
    r = word_problem_solver.solve(
        "A fiber crew installs the same number of splice trays in 7 cabinets. "
        "Each cabinet gets 18 trays. Later, 9 trays are removed because they are damaged. "
        "The remaining trays are split evenly between 3 service zones. "
        "How many trays does each zone get?"
    )
    assert r is not None and r.solved
    assert r.method == "word_problem_template"

def test_cylinder_template_does_not_need_opus():
    """Template solver handles the wastewater problem without any LLM call."""
    r = template_solver.solve(
        "A wastewater pond is a cylinder with hemispherical cap, volume 12000 m³. "
        "Cylinder walls $45/m², hemisphere $80/m², bottom free. Minimize cost."
    )
    assert r is not None and r.solved
    assert "opus" not in r.method
