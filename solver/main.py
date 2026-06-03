"""
Relay Math Solver — FastAPI backend
=====================================
Pipeline:
  1. Classify problem (simple / medium / advanced)
  2a. Simple  → Claude direct solve
  2b. Medium/Advanced → Claude generates SymPy code → safe Python exec → verify
  3. If SymPy path fails → Claude fallback with strong prompting
  4. Return JSON: { steps, answer, verified, method }

Deploy on Railway / Render / Fly.io and set ANTHROPIC_API_KEY env var.
Point SOLVER_URL in Netlify Function to this service.
"""

import os
import traceback

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

from classifier import classify_problem
from llm_client import format_verified_result, generate_sympy_code, llm_direct_solve
from math_engine import execute_sympy_code, verify_optimization

load_dotenv()

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Relay Math Solver",
    description="Deterministic SymPy-backed math solver for fatanett.com",
    version="1.0.0",
)

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "https://fatanett.com,http://localhost:3000,http://localhost:8888"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "OPTIONS", "GET"],
    allow_headers=["*"],
)


# ── Request / Response models ─────────────────────────────────────────────────

class SolveRequest(BaseModel):
    problem: str

    @field_validator("problem")
    @classmethod
    def validate_problem(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Problem cannot be empty")
        if len(v) > 3000:
            raise ValueError("Problem too long (max 3000 chars)")
        return v


class SolveResponse(BaseModel):
    steps: list[str]
    answer: str
    verified: bool
    method: str   # "sympy" | "llm" | "llm_fallback"
    difficulty: str  # "simple" | "medium" | "advanced"


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/")
async def health():
    return {"status": "ok", "service": "relay-math-solver"}


# ── Main solve endpoint ───────────────────────────────────────────────────────

@app.post("/solve", response_model=SolveResponse)
async def solve(req: SolveRequest):
    problem = req.problem
    difficulty = classify_problem(problem)

    # ── Path A: Simple → Claude direct ────────────────────────────────────────
    if difficulty == "simple":
        result = await llm_direct_solve(problem)
        return SolveResponse(
            steps=result["steps"],
            answer=result["answer"],
            verified=False,
            method="llm",
            difficulty=difficulty,
        )

    # ── Path B: Medium / Advanced → SymPy pipeline ────────────────────────────
    sympy_error: str | None = None

    try:
        # Step 1: Claude generates SymPy code
        code = await generate_sympy_code(problem)

        # Step 2: Execute safely
        raw = execute_sympy_code(code)

        # Step 3: Verify
        is_verified = verify_optimization(raw)

        # Step 4: Polish the steps (Claude reformats, numbers unchanged)
        if is_verified:
            polished = await format_verified_result(problem, raw)
            return SolveResponse(
                steps=polished["steps"],
                answer=polished["answer"],
                verified=True,
                method="sympy",
                difficulty=difficulty,
            )
        else:
            # SymPy ran but verification failed — fall through to LLM
            sympy_error = f"Verification failed: {raw.get('answer', 'unknown')}"

    except Exception as exc:
        sympy_error = str(exc)
        traceback.print_exc()

    # ── Path C: SymPy failed — strong-prompted LLM fallback ───────────────────
    result = await llm_direct_solve(problem)

    # Prepend a transparency note if the hard solver failed
    if sympy_error and difficulty == "advanced":
        note = "⚠ Symbolic solver encountered an issue — this answer is LLM-generated and may contain arithmetic errors. Please verify independently."
        result["steps"] = [note] + result["steps"]

    return SolveResponse(
        steps=result["steps"],
        answer=result["answer"],
        verified=False,
        method="llm_fallback",
        difficulty=difficulty,
    )


# ── Error handlers ────────────────────────────────────────────────────────────

@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(Exception)
async def generic_error(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"error": "Internal solver error"})


# ── Entry point (local dev) ───────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
