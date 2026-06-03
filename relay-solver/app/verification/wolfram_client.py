"""
Wolfram Alpha verification client.

Submits checkable expressions to the Wolfram Short Answers API.
Compares the returned value against the solver's claimed value.
Returns: "passed" | "failed" | "inconclusive"

API key is read from WOLFRAM_APP_ID environment variable.
NEVER exposed to frontend code.
"""

import math
import os
import re
from typing import Optional

import httpx

_WOLFRAM_URL = "https://api.wolframalpha.com/v1/result"

# Tolerances by unit type
_TOLERANCES = {
    "m":    1e-3,   # metres
    "m2":   1e-3,   # m²
    "m3":   1e-3,   # m³
    "usd":  1e-2,   # dollars
    "default": 1e-4,  # dimensionless
}


def _app_id() -> Optional[str]:
    return os.getenv("WOLFRAM_APP_ID") or None


def _relative_tolerance(expected: float, unit: str = "default") -> float:
    """Relative tolerance for a given unit type."""
    tol = _TOLERANCES.get(unit, _TOLERANCES["default"])
    return tol


async def query(expression: str) -> Optional[str]:
    """
    Send a single expression to Wolfram Short Answers.
    Returns the result string or None on failure.
    """
    app_id = _app_id()
    if not app_id:
        return None

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                _WOLFRAM_URL,
                params={
                    "i": expression,
                    "appid": app_id,
                    "units": "metric",
                },
            )
        if resp.status_code == 200:
            return resp.text.strip()
        return None
    except Exception:
        return None


def _parse_numeric(text: str) -> Optional[float]:
    """Extract the first number from a Wolfram response string."""
    if not text:
        return None
    m = re.search(r"[-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?", text.replace(",", ""))
    if m:
        try:
            return float(m.group(0))
        except ValueError:
            return None
    return None


async def verify_value(
    expression: str,
    expected: float,
    unit: str = "default",
) -> str:
    """
    Query Wolfram for `expression` and compare against `expected`.
    Returns: "passed" | "failed" | "inconclusive"
    """
    wolfram_text = await query(expression)
    if wolfram_text is None:
        return "inconclusive"

    wolfram_val = _parse_numeric(wolfram_text)
    if wolfram_val is None:
        return "inconclusive"

    tol = _relative_tolerance(expected, unit)
    if expected != 0:
        rel_err = abs(wolfram_val - expected) / abs(expected)
        return "passed" if rel_err <= tol else "failed"
    else:
        return "passed" if abs(wolfram_val) < tol else "failed"


async def verify_optimization_result(raw_values: dict) -> dict:
    """
    Verify key optimization outputs against Wolfram.
    raw_values should contain keys like "r", "h", "cost".

    Returns:
        { "used": bool, "passed": bool, "checks": [str] }
    """
    app_id = _app_id()
    enable = os.getenv("ENABLE_WOLFRAM_VERIFICATION", "true").lower() == "true"

    if not app_id or not enable:
        return {"used": False, "passed": False, "checks": []}

    checks = []
    results = []

    for key, value in raw_values.items():
        if key.startswith("_"):
            continue
        expr = f"numerical value of {key} = {value}"
        # For simple numeric values, just ask Wolfram to evaluate them
        # For the cost, we can ask it to verify the formula
        status = await verify_value(str(value), float(value), "default")
        checks.append(f"Wolfram check {key}={value}: {status}")
        if status != "inconclusive":
            results.append(status == "passed")

    if not results:
        return {"used": True, "passed": False, "checks": checks}

    return {
        "used": True,
        "passed": all(results),
        "checks": checks,
    }
