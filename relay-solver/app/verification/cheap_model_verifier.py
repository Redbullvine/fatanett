"""
Cheap model verifier — backup verification step.

Calls ANTHROPIC_VERIFIER_MODEL to do a consistency review of the solution.
Used only after SymPy/Wolfram checks to catch logical errors those miss.
"""

import json
import os
import re
from typing import Optional

import httpx

from app.prompts.cheap_verifier_prompt import CHEAP_VERIFIER_SYSTEM, build_verifier_prompt

_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
_ANTHROPIC_VER = "2023-06-01"


def _verifier_model() -> str:
    return os.getenv("ANTHROPIC_VERIFIER_MODEL", "claude-haiku-3-5")


def _headers() -> dict:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    return {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": _ANTHROPIC_VER,
    }


async def verify(
    problem: str,
    solution_markdown: str,
    final_values: dict,
) -> dict:
    """
    Ask the cheap verifier model to review the solution.

    Returns:
        {
          "used": bool,
          "passed": bool,
          "reason": str,
          "errors": list[str],
        }
    """
    enable = os.getenv("ENABLE_PREMIUM_ESCALATION", "true").lower() == "true"
    if not enable:
        return {"used": False, "passed": True, "reason": "disabled", "errors": []}

    prompt = build_verifier_prompt(problem, solution_markdown, final_values)

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                _ANTHROPIC_URL,
                headers=_headers(),
                json={
                    "model": _verifier_model(),
                    "max_tokens": 512,
                    "system": CHEAP_VERIFIER_SYSTEM,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        # Verifier unavailable — treat as inconclusive (don't block)
        return {"used": True, "passed": True, "reason": "verifier_unavailable", "errors": []}

    block = next((b for b in data.get("content", []) if b["type"] == "text"), None)
    if not block:
        return {"used": True, "passed": True, "reason": "empty_response", "errors": []}

    raw = block["text"].strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", raw)
        try:
            parsed = json.loads(m.group(0)) if m else {}
        except Exception:
            parsed = {}

    return {
        "used": True,
        "passed": bool(parsed.get("passed", True)),
        "reason": parsed.get("reason", ""),
        "errors": parsed.get("detected_errors", []),
    }
