"""
Tests for safe failure behavior.

When verification fails, the system MUST return COMPUTE_OVERLOADED
and MUST NOT expose a wrong answer.
"""

import pytest
from app.models import OVERLOADED_MESSAGE, SolverResult, VerificationDetail
from app.verification.local_numeric_checks import verify_locally


# ── Local numeric checks ──────────────────────────────────────────────────────

def test_negative_radius_fails():
    raw = {"r": -5.0, "h": 20.0, "cost": 100000.0}
    passed, detail, checks = verify_locally(raw, [], "cylinder hemisphere")
    assert not passed


def test_infinite_value_fails():
    import math
    raw = {"r": math.inf, "h": 20.0}
    passed, detail, checks = verify_locally(raw, [], "")
    assert not passed


def test_valid_values_pass():
    raw = {"r": 11.9788, "h": 18.6337, "cost": 135238.51}
    passed, detail, checks = verify_locally(raw, [], "cylinder hemisphere")
    assert passed


# ── Overloaded message ────────────────────────────────────────────────────────

def test_overloaded_message_text():
    assert "overloaded" in OVERLOADED_MESSAGE.lower()
    assert "try again" in OVERLOADED_MESSAGE.lower()


def test_overloaded_message_exact():
    assert OVERLOADED_MESSAGE == (
        "Relay is overloaded with computing right now. "
        "Please try again later."
    )


# ── Cache never stores failures ───────────────────────────────────────────────

def test_cache_rejects_overloaded():
    from app import cache
    cache.put("some problem", {
        "status": "COMPUTE_OVERLOADED",
        "verified": False,
        "answer_summary": OVERLOADED_MESSAGE,
    })
    result = cache.get("some problem")
    assert result is None, "Cache must not store COMPUTE_OVERLOADED responses"


def test_cache_rejects_unverified():
    from app import cache
    cache.put("unverified problem", {
        "status": "LOCAL_VERIFIED",
        "verified": False,   # <-- not verified
        "answer_summary": "42",
    })
    result = cache.get("unverified problem")
    assert result is None, "Cache must not store unverified responses"


def test_cache_stores_verified():
    from app import cache
    cache.put("2+2", {
        "status": "LOCAL_VERIFIED",
        "verified": True,
        "answer_summary": "4",
    })
    result = cache.get("2+2")
    assert result is not None
    assert result["answer_summary"] == "4"


# ── Rate limiter ──────────────────────────────────────────────────────────────

def test_rate_limit_resets_on_new_day():
    from app import rate_limit
    import unittest.mock as mock
    import time

    # Simulate being on day 1
    with mock.patch("app.rate_limit._today", return_value="2099-01-01"):
        with mock.patch("app.rate_limit.max_per_day", return_value=2):
            # Reset state
            rate_limit._date_str = ""
            rate_limit._count    = 0
            assert rate_limit.check_and_increment() is True   # 1
            assert rate_limit.check_and_increment() is True   # 2
            assert rate_limit.check_and_increment() is False  # cap hit

    # Simulate new day — should reset
    with mock.patch("app.rate_limit._today", return_value="2099-01-02"):
        with mock.patch("app.rate_limit.max_per_day", return_value=2):
            assert rate_limit.check_and_increment() is True   # reset
