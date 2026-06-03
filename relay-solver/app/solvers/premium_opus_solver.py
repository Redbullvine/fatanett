"""
LANE 3 — Premium Opus Solver

Calls ANTHROPIC_PREMIUM_MODEL (configurable, default claude-opus-4-5).
Parses the machine-checkable FINAL_VALUES / CONSTRAINT_CHECKS / VERIFICATION_EQUATIONS
block from the response for downstream verification.
"""

import os
import re
from typing import Optional

import httpx

from app.models import SolverResult
from app.prompts.opus_solver_prompt import OPUS_SOLVER_SYSTEM, build_opus_prompt


_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
_ANTHROPIC_VER = "2023-06-01"


def _model() -> str:
    return os.getenv("ANTHROPIC_PREMIUM_MODEL", "claude-opus-4-5")


def _headers() -> dict:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    return {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": _ANTHROPIC_VER,
    }


def _parse_machine_block(text: str) -> dict:
    """
    Extract the FINAL_VALUES, CONSTRAINT_CHECKS, and VERIFICATION_EQUATIONS
    blocks from the Opus response.

    Returns:
        {
          "final_values":         { varname: float },
          "constraint_checks":    [ "eq=value", ... ],
          "verification_equations": [ "eq1", ... ],
        }
    """
    result = {
        "final_values": {},
        "constraint_checks": [],
        "verification_equations": [],
    }

    # FINAL_VALUES block
    fv_match = re.search(
        r"FINAL_VALUES:\s*(.*?)(?:CONSTRAINT_CHECKS:|VERIFICATION_EQUATIONS:|$)",
        text,
        re.DOTALL,
    )
    if fv_match:
        for line in fv_match.group(1).strip().splitlines():
            line = line.strip()
            if "=" in line:
                k, _, v = line.partition("=")
                try:
                    result["final_values"][k.strip()] = float(v.strip().replace(",", ""))
                except ValueError:
                    pass  # symbolic value — skip

    # CONSTRAINT_CHECKS block
    cc_match = re.search(
        r"CONSTRAINT_CHECKS:\s*(.*?)(?:VERIFICATION_EQUATIONS:|$)",
        text,
        re.DOTALL,
    )
    if cc_match:
        for line in cc_match.group(1).strip().splitlines():
            line = line.strip()
            if line and "=" in line:
                result["constraint_checks"].append(line)

    # VERIFICATION_EQUATIONS block
    ve_match = re.search(
        r"VERIFICATION_EQUATIONS:\s*(.*?)$",
        text,
        re.DOTALL,
    )
    if ve_match:
        for line in ve_match.group(1).strip().splitlines():
            line = line.strip()
            if line:
                result["verification_equations"].append(line)

    return result


def _strip_machine_block(text: str) -> str:
    """Remove the machine-checkable block from the solution for display."""
    return re.sub(
        r"\nFINAL_VALUES:.*$",
        "",
        text,
        flags=re.DOTALL,
    ).strip()


async def solve(problem: str) -> Optional[SolverResult]:
    """
    Call the premium Opus model to solve the problem.
    Returns SolverResult with raw_values populated from the machine block.
    Returns None on API error.
    """
    prompt = build_opus_prompt(problem)

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                _ANTHROPIC_URL,
                headers=_headers(),
                json={
                    "model": _model(),
                    "max_tokens": 4096,
                    "system": OPUS_SOLVER_SYSTEM,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        return None  # caller will escalate to COMPUTE_OVERLOADED

    if data.get("type") == "error":
        return None

    block = next((b for b in data.get("content", []) if b["type"] == "text"), None)
    if not block:
        return None

    raw_text = block["text"].strip()
    machine  = _parse_machine_block(raw_text)
    display  = _strip_machine_block(raw_text)

    # Build answer_summary from FINAL_VALUES
    fv = machine["final_values"]
    if fv:
        summary_parts = [f"{k} ≈ {v}" for k, v in fv.items()]
        answer_summary = ", ".join(summary_parts)
    else:
        # Fall back to last non-empty line of display
        lines = [l.strip() for l in display.splitlines() if l.strip()]
        answer_summary = lines[-1] if lines else "See solution below"

    return SolverResult(
        solved=True,
        answer_summary=answer_summary,
        solution_markdown=display,
        method="opus",
        raw_values=fv,
        constraint_checks=machine["constraint_checks"],
        verification_eqs=machine["verification_equations"],
    )
