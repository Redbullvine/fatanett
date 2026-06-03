"""
Data models for the Relay Math Solver API.
All request/response shapes are defined here.
"""

import os
from enum import Enum
from typing import Optional
from pydantic import BaseModel, field_validator


# ── Enumerations ──────────────────────────────────────────────────────────────

class Classification(str, Enum):
    SIMPLE   = "simple"    # arithmetic, basic expression
    MEDIUM   = "medium"    # algebra, simple derivative/integral
    ADVANCED = "advanced"  # optimization, geometry, multi-step calculus
    EXPERT   = "expert"    # multivariable, DEs, proof-like


class SolverStatus(str, Enum):
    LOCAL_VERIFIED          = "LOCAL_VERIFIED"           # deterministic, no premium
    LOCAL_SYMBOLIC_VERIFIED = "LOCAL_SYMBOLIC_VERIFIED"  # SymPy/SciPy verified
    VERIFIED_PREMIUM        = "VERIFIED_PREMIUM"         # Opus + verification passed
    COMPUTE_OVERLOADED      = "COMPUTE_OVERLOADED"       # verification failed / cap hit
    SOLVER_UNAVAILABLE      = "SOLVER_UNAVAILABLE"       # service down


OVERLOADED_MESSAGE = (
    "Relay is overloaded with computing right now. "
    "Please try again later."
)


# ── Sub-models ────────────────────────────────────────────────────────────────

class NetworkStats(BaseModel):
    ping_ms:        Optional[float] = None
    download_mbps:  Optional[float] = None
    upload_mbps:    Optional[float] = None


class VerificationDetail(BaseModel):
    sympy_passed:           bool        = False
    scipy_passed:           bool        = False
    wolfram_used:           bool        = False
    wolfram_passed:         bool        = False
    cheap_verifier_used:    bool        = False
    cheap_verifier_passed:  bool        = False
    checks:                 list[str]   = []


# ── Request ───────────────────────────────────────────────────────────────────

class SolveRequest(BaseModel):
    problem:       str
    network_stats: Optional[NetworkStats] = None

    @field_validator("problem")
    @classmethod
    def validate_problem(cls, v: str) -> str:
        v = v.strip()
        max_chars = int(os.getenv("MAX_PROBLEM_CHARS", "6000"))
        if not v:
            raise ValueError("Problem cannot be empty")
        if len(v) > max_chars:
            raise ValueError(f"Problem too long (max {max_chars} chars)")
        return v


# ── Response ──────────────────────────────────────────────────────────────────

class SolveResponse(BaseModel):
    ok:                  bool
    classification:      str
    status:              str
    verified:            bool
    method:              str
    answer_summary:      str
    solution_markdown:   str
    verification:        VerificationDetail
    warnings:            list[str]           = []
    network_stats:       Optional[dict]      = None


# ── Internal solver result (not exposed directly) ─────────────────────────────

class SolverResult(BaseModel):
    """Internal result passed between solver stages and the verifier."""
    solved:             bool        = False
    answer_summary:     str         = ""
    solution_markdown:  str         = ""
    method:             str         = "unknown"
    # Raw numeric values for verification substitution
    raw_values:         dict        = {}
    # Machine-checkable equations (e.g. from Opus FINAL_VALUES block)
    constraint_checks:  list[str]   = []
    verification_eqs:   list[str]   = []
    warnings:           list[str]   = []
