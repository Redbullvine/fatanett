"""Tests for the arithmetic solver (LANE 1A)."""

import pytest
from app.solvers.arithmetic_solver import solve


def test_simple_addition():
    r = solve("2+2")
    assert r is not None and r.solved
    assert r.answer_summary == "4"
    assert r.method == "arithmetic"


def test_complex_expression():
    r = solve("(137 + 423) * 7 / 3")
    assert r is not None and r.solved
    # 560 * 7 / 3 = 3920 / 3 ≈ 1306.6666...
    val = float(r.raw_values["result"])
    assert abs(val - (560 * 7 / 3)) < 1e-6


def test_negative():
    r = solve("-5 * 3 + 20")
    assert r is not None and r.solved
    assert float(r.raw_values["result"]) == 5.0


def test_decimal():
    r = solve("3.14 * 2")
    assert r is not None and r.solved
    assert abs(float(r.raw_values["result"]) - 6.28) < 1e-6


def test_exponent():
    r = solve("2 ** 10")
    assert r is not None and r.solved
    assert float(r.raw_values["result"]) == 1024.0


def test_division_by_zero():
    r = solve("1 / 0")
    assert r is None  # should not return a result


def test_word_problem_ignored():
    r = solve("A train travels 60 mph for 2.5 hours. How far?")
    assert r is None  # not a pure expression


def test_no_code_injection():
    r = solve("__import__('os').system('echo hi')")
    assert r is None


def test_large_result():
    r = solve("999999 * 999999")
    assert r is not None and r.solved
    assert float(r.raw_values["result"]) == 999999 ** 2
