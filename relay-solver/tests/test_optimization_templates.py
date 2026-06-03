"""Tests for the optimization template solver — cylinder + hemisphere."""

import math
import pytest
from app.solvers.template_solver import solve

WASTEWATER = (
    "A wastewater pond is a cylinder with hemispherical cap, volume 12000 m³. "
    "Cylinder walls $45/m², hemisphere $80/m², bottom free. Minimize cost."
)

# Reference values from exact symbolic solution
EXPECTED_R    = 11.9788   # (5400/π)^(1/3)
EXPECTED_H    = 18.6337
EXPECTED_COST = 135238.51
VOLUME        = 12000.0


def test_wastewater_solves():
    r = solve(WASTEWATER)
    assert r is not None, "Template solver should match this problem"
    assert r.solved


def test_wastewater_r_value():
    r = solve(WASTEWATER)
    assert abs(r.raw_values["r"] - EXPECTED_R) < 0.01, (
        f"Expected r≈{EXPECTED_R}, got {r.raw_values['r']}"
    )


def test_wastewater_h_value():
    r = solve(WASTEWATER)
    assert abs(r.raw_values["h"] - EXPECTED_H) < 0.01, (
        f"Expected h≈{EXPECTED_H}, got {r.raw_values['h']}"
    )


def test_wastewater_cost():
    r = solve(WASTEWATER)
    assert abs(r.raw_values["cost"] - EXPECTED_COST) < 5.0, (
        f"Expected cost≈{EXPECTED_COST}, got {r.raw_values['cost']}"
    )


def test_wastewater_volume_verified():
    r = solve(WASTEWATER)
    rv = r.raw_values
    V_check = math.pi * rv["r"]**2 * rv["h"] + (2/3) * math.pi * rv["r"]**3
    assert abs(V_check - VOLUME) < 1.0, f"Volume check failed: {V_check:.2f} vs {VOLUME}"


def test_wastewater_no_warnings():
    r = solve(WASTEWATER)
    assert not r.warnings, f"Unexpected warnings: {r.warnings}"


def test_wastewater_method_is_verified():
    r = solve(WASTEWATER)
    assert r.method in ("sympy", "arithmetic")


def test_alternate_phrasing():
    # Different wording — should still match
    problem = (
        "Design a cylindrical tank with hemispherical top to hold 12000 cubic metres. "
        "The cylinder wall costs $45 per m² and the hemisphere costs $80 per m². "
        "The bottom is free. Find the dimensions that minimize cost."
    )
    r = solve(problem)
    assert r is not None and r.solved
    assert abs(r.raw_values["r"] - EXPECTED_R) < 0.05


def test_unrelated_problem_returns_none():
    r = solve("Solve x^2 + 5x + 6 = 0")
    assert r is None
