"""
Relay Math Solver — FastAPI Backend
=====================================

Five solving lanes:
  LOCAL_VERIFIED          — arithmetic / deterministic word problem
  LOCAL_SYMBOLIC_VERIFIED — SymPy/SciPy / optimization template
  VERIFIED_PREMIUM        — Opus + independent verification passed
  COMPUTE_OVERLOADED      — verification failed / cap hit / timeout
  SOLVER_UNAVAILABLE      — service configuration error

Pipeline (per request):
  1. Normalize → 2. Cache → 3. Classify → 4. Arithmetic →
  5. Word template → 6. Optimization template → 7. SymPy (medium) →
  8. Opus (advanced/expert) → 9. Verify → 10. Cache + return
"""

import hashlib
import logging
import os
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app import cache, rate_limit
from app.classifier import classify_problem
from app.models import (
    Classification,
    NetworkStats,
    SolveRequest,
    SolveResponse,
    SolverResult,
    SolverStatus,
    VerificationDetail,
    OVERLOADED_MESSAGE,
)
from app.solvers import (
    arithmetic_solver,
    word_problem_solver,
    template_solver,
    premium_opus_solver,
)
from app.verifier import run_verification

load_dotenv()
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("relay_solver")


# ── Startup / shutdown ────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Relay Solver starting up")
    yield
    log.info("Relay Solver shutting down")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Relay Math Solver",
    version="2.0.0",
    lifespan=lifespan,
)

_allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "https://fatanett.com,http://localhost:3000,http://localhost:8888",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _overloaded_response(classification: str, warnings: list[str] | None = None) -> SolveResponse:
    return SolveResponse(
        ok=False,
        classification=classification,
        status=SolverStatus.COMPUTE_OVERLOADED,
        verified=False,
        method="verification_failed",
        answer_summary=OVERLOADED_MESSAGE,
        solution_markdown=OVERLOADED_MESSAGE,
        verification=VerificationDetail(),
        warnings=(warnings or []) + ["Verification failed or was inconclusive."],
        network_stats=None,
    )


def _log_request(problem: str, classification: str, status: str, method: str, verified: bool) -> None:
    """Log only non-PII metadata."""
    problem_hash = hashlib.sha256(cache.normalize(problem).encode()).hexdigest()[:12]
    log.info(
        "solve | hash=%s | class=%s | status=%s | method=%s | verified=%s",
        problem_hash, classification, status, method, verified,
    )


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/")
async def health():
    return {
        "status": "ok",
        "service": "relay-math-solver",
        "premium_remaining_today": rate_limit.remaining(),
        "cache_size": cache.size(),
    }


# ── Main solve endpoint ───────────────────────────────────────────────────────

@app.post("/solve", response_model=SolveResponse)
async def solve(req: SolveRequest):
    problem       = req.problem
    network_stats = req.network_stats.model_dump() if req.network_stats else None

    # ── 1. Cache lookup ───────────────────────────────────────────────────────
    cached = cache.get(problem)
    if cached:
        cached["method"] = "cache"
        cached["network_stats"] = network_stats
        log.info("cache hit for hash=%s", cache.cache_key(problem)[:12])
        return SolveResponse(**cached)

    # ── 2. Classify ───────────────────────────────────────────────────────────
    classification = classify_problem(problem)
    cls_str = classification.value

    # ── 3. LANE 1A — Pure arithmetic ─────────────────────────────────────────
    arith = arithmetic_solver.solve(problem)
    if arith and arith.solved:
        resp = SolveResponse(
            ok=True,
            classification=cls_str,
            status=SolverStatus.LOCAL_VERIFIED,
            verified=True,
            method=arith.method,
            answer_summary=arith.answer_summary,
            solution_markdown=arith.solution_markdown,
            verification=VerificationDetail(
                sympy_passed=True,
                scipy_passed=True,
                checks=arith.constraint_checks,
            ),
            warnings=arith.warnings,
            network_stats=network_stats,
        )
        cache.put(problem, resp.model_dump())
        _log_request(problem, cls_str, resp.status, resp.method, True)
        return resp

    # ── 3. LANE 1B — Word problem templates ──────────────────────────────────
    word = word_problem_solver.solve(problem)
    if word and word.solved:
        resp = SolveResponse(
            ok=True,
            classification=cls_str,
            status=SolverStatus.LOCAL_VERIFIED,
            verified=True,
            method=word.method,
            answer_summary=word.answer_summary,
            solution_markdown=word.solution_markdown,
            verification=VerificationDetail(
                sympy_passed=True,
                scipy_passed=True,
                checks=word.constraint_checks,
            ),
            warnings=word.warnings,
            network_stats=network_stats,
        )
        cache.put(problem, resp.model_dump())
        _log_request(problem, cls_str, resp.status, resp.method, True)
        return resp

    # ── 4. LANE 2 — Optimization templates (deterministic + verified) ─────────
    tmpl = template_solver.solve(problem)
    if tmpl and tmpl.solved:
        # Template solver verifies internally
        local_passed = not tmpl.warnings
        resp = SolveResponse(
            ok=True,
            classification=cls_str,
            status=SolverStatus.LOCAL_SYMBOLIC_VERIFIED,
            verified=local_passed,
            method=tmpl.method,
            answer_summary=tmpl.answer_summary,
            solution_markdown=tmpl.solution_markdown,
            verification=VerificationDetail(
                sympy_passed=local_passed,
                scipy_passed=local_passed,
                checks=tmpl.constraint_checks,
            ),
            warnings=tmpl.warnings,
            network_stats=network_stats,
        )
        if local_passed:
            cache.put(problem, resp.model_dump())
        _log_request(problem, cls_str, resp.status, resp.method, local_passed)
        return resp

    # ── 5. For simple/medium: return COMPUTE_OVERLOADED if no local match ────
    #    (We don't call Opus for problems classified simple or medium)
    if classification in (Classification.SIMPLE, Classification.MEDIUM):
        _log_request(problem, cls_str, "COMPUTE_OVERLOADED", "no_match", False)
        return _overloaded_response(cls_str, ["No deterministic solver matched this problem."])

    # ── 6. LANE 3 — Premium Opus (advanced/expert) ───────────────────────────
    if not rate_limit.check_and_increment():
        _log_request(problem, cls_str, "COMPUTE_OVERLOADED", "rate_limited", False)
        return _overloaded_response(cls_str, ["Daily premium solve limit reached."])

    try:
        opus_result = await premium_opus_solver.solve(problem)
    except Exception as e:
        log.error("Opus solver exception: %s", e)
        opus_result = None

    if opus_result is None or not opus_result.solved:
        _log_request(problem, cls_str, "COMPUTE_OVERLOADED", "opus_failed", False)
        return _overloaded_response(cls_str, ["Premium solver unavailable."])

    # ── 7. LANE 4 — Verification pipeline ────────────────────────────────────
    try:
        verified, detail = await run_verification(problem, opus_result)
    except Exception as e:
        log.error("Verification pipeline exception: %s", e)
        verified = False
        detail   = VerificationDetail()

    if not verified:
        _log_request(problem, cls_str, "COMPUTE_OVERLOADED", "verification_failed", False)
        return _overloaded_response(cls_str)

    # ── 8. LANE 4 passed — VERIFIED_PREMIUM ──────────────────────────────────
    resp = SolveResponse(
        ok=True,
        classification=cls_str,
        status=SolverStatus.VERIFIED_PREMIUM,
        verified=True,
        method="opus_verified",
        answer_summary=opus_result.answer_summary,
        solution_markdown=opus_result.solution_markdown,
        verification=detail,
        warnings=opus_result.warnings,
        network_stats=network_stats,
    )
    cache.put(problem, resp.model_dump())
    _log_request(problem, cls_str, resp.status, resp.method, True)
    return resp


# ── Error handlers ────────────────────────────────────────────────────────────

@app.exception_handler(ValidationError)
async def validation_error(request: Request, exc: ValidationError):
    return JSONResponse(status_code=422, content={"error": str(exc)})


@app.exception_handler(Exception)
async def generic_error(request: Request, exc: Exception):
    log.exception("Unhandled exception")
    return JSONResponse(
        status_code=500,
        content={
            "ok": False,
            "status": "SOLVER_UNAVAILABLE",
            "answer_summary": OVERLOADED_MESSAGE,
            "error": "Internal solver error",
        },
    )
