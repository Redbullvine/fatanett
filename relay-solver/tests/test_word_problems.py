"""Tests for the word problem solver (LANE 1B)."""

import pytest
from app.solvers.word_problem_solver import solve


# ── Fiber tray splice problem ─────────────────────────────────────────────────

FIBER_PROBLEM = (
    "A fiber crew installs the same number of splice trays in 7 cabinets. "
    "Each cabinet gets 18 trays. Later, 9 trays are removed because they are damaged. "
    "The remaining trays are split evenly between 3 service zones. "
    "How many trays does each zone get?"
)

def test_fiber_tray_answer():
    r = solve(FIBER_PROBLEM)
    assert r is not None and r.solved
    # 7*18 = 126, 126-9 = 117, 117/3 = 39
    assert float(r.raw_values["per_zone"]) == 39.0
    assert "39" in r.answer_summary


def test_fiber_tray_steps_present():
    r = solve(FIBER_PROBLEM)
    assert r is not None
    assert "126" in r.solution_markdown   # 7*18
    assert "117" in r.solution_markdown   # 126-9
    assert "39"  in r.solution_markdown   # 117/3


# ── Hard port configuration problem ──────────────────────────────────────────

PORT_PROBLEM = (
    "A fiber crew configures 18 cabinets with 32 active ports each and "
    "11 cabinets with 24 active ports each. During testing, 72 ports fail "
    "and are removed from service. Later, the warehouse delivers 96 replacement "
    "ports, but 24 of those are held back as emergency spares. "
    "The remaining usable ports are split evenly across 8 service zones. "
    "How many usable ports does each zone receive?"
)

def test_port_config_answer():
    r = solve(PORT_PROBLEM)
    assert r is not None and r.solved
    # 18*32 + 11*24 = 576 + 264 = 840
    # 840 - 72 = 768
    # 96 - 24 = 72 replacement
    # 768 + 72 = 840
    # 840 / 8 = 105
    assert float(r.raw_values["per_zone"]) == 105.0
    assert "105" in r.answer_summary


def test_port_config_intermediate_values():
    r = solve(PORT_PROBLEM)
    assert r is not None
    rv = r.raw_values
    assert rv["total_installed"] == 840
    assert rv["usable_total"]    == 840


# ── Unknown pattern returns None ─────────────────────────────────────────────

def test_no_match_returns_none():
    r = solve("What is the meaning of life?")
    assert r is None


def test_calculus_not_matched():
    r = solve("Minimize C = 1080000/r + 100*pi*r^2")
    assert r is None   # not a word problem template
