"""
LLM client — Claude API calls for:
  1. Generating SymPy solver code from a word problem
  2. Direct solving of simple problems
  3. Formatting verified SymPy results into readable steps
"""

import json
import os
import httpx

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
MODEL = "claude-sonnet-4-5"


def _headers() -> dict:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    return {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": ANTHROPIC_VERSION,
    }


async def _call(system: str, user: str, max_tokens: int = 2048) -> str:
    """Raw Claude API call. Returns the text content."""
    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post(
            ANTHROPIC_URL,
            headers=_headers(),
            json={
                "model": MODEL,
                "max_tokens": max_tokens,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
        )
    resp.raise_for_status()
    data = resp.json()
    if data.get("type") == "error":
        raise RuntimeError(data["error"]["message"])
    block = next((b for b in data["content"] if b["type"] == "text"), None)
    return (block["text"] or "").strip()


# ── 1. Generate SymPy solver code ─────────────────────────────────────────────

CODEGEN_SYSTEM = """You are a mathematical code generator. Convert the user's math or word problem into
executable Python code using SymPy (and scipy/numpy when needed) that solves it exactly.

OUTPUT RULES — CRITICAL:
- Output ONLY valid Python code. No markdown, no ```python fences, no explanation outside comments.
- The code must set a variable called RESULT (a dict) as the very last statement.
- RESULT must have exactly these keys:
    answer   (str)  — final answer with units, e.g. "r ≈ 11.98 m, h ≈ 18.62 m, cost ≈ $135,251"
    steps    (list of str) — 4 to 6 human-readable calculation steps
    verified (bool) — True if you plugged the answer back and it satisfies all constraints
    raw      (dict) — key numeric results as Python floats, e.g. {"r": 11.98, "h": 18.62, "cost": 135251}

SOLVER RULES:
- Always use SymPy for symbolic solving. Avoid hand-arithmetic.
- Use symbols(..., positive=True) for physical quantities (lengths, costs).
- After solving symbolically, evaluate numerically with N(..., 8) for 8 significant figures.
- ALWAYS verify: substitute the solution back into every constraint and check it holds.
- If a verification fails, set verified=False and explain in the answer string.
- For optimization: solve dC/dr=0, confirm it's a minimum with d²C/dr²>0.
- Include units in all step strings.
- steps must show: setup → substitution → critical equation → numerical solve → verification

EXAMPLE for "cylinder + hemisphere, V=12000, minimize cost":
```
from sympy import symbols, pi, diff, solve, N, Rational, sqrt

r = symbols('r', positive=True)

# Volume: pi*r^2*h + (2/3)*pi*r^3 = 12000 → solve for h
h = (12000 - Rational(2,3)*pi*r**3) / (pi*r**2)

# Cost: lateral cylinder + hemisphere surface (bottom free)
C = 45*(2*pi*r*h) + 80*(2*pi*r**2)

dC = diff(C, r)
r_sols = solve(dC, r)
r_opt = [s for s in r_sols if s.is_real and s.is_positive][0]

h_opt = h.subs(r, r_opt)
C_opt = C.subs(r, r_opt)

r_val = float(N(r_opt, 8))
h_val = float(N(h_opt, 8))
C_val = float(N(C_opt, 8))

# Verify volume
import math
V_check = math.pi*r_val**2*h_val + (2/3)*math.pi*r_val**3
verified = abs(V_check - 12000) < 1.0  # within 1 m³

RESULT = {
    "answer": f"r ≈ {r_val:.2f} m, h ≈ {h_val:.2f} m, minimum cost ≈ ${C_val:,.0f}",
    "steps": [
        f"Volume constraint: πr²h + (2/3)πr³ = 12,000 → h = 12,000/(πr²) − 2r/3",
        f"Cost function: C = 45·2πrh + 80·2πr² = 1,080,000/r + 100πr²",
        f"Minimize: dC/dr = −1,080,000/r² + 200πr = 0 → r³ = 5,400/π",
        f"Solve: r = ∛(5,400/π) ≈ {r_val:.4f} m, h ≈ {h_val:.4f} m",
        f"Verify: V = π·{r_val:.4f}²·{h_val:.4f} + (2/3)π·{r_val:.4f}³ ≈ {V_check:.1f} m³ ✓",
        f"Minimum cost: C ≈ ${C_val:,.0f}",
    ],
    "verified": verified,
    "raw": {"r": r_val, "h": h_val, "cost": C_val},
}
```

Now generate code for the user's problem:"""


async def generate_sympy_code(problem: str) -> str:
    """Ask Claude to produce SymPy solver code for the problem."""
    raw = await _call(CODEGEN_SYSTEM, problem, max_tokens=2500)

    # Strip accidental markdown fences
    raw = raw.strip()
    if raw.startswith("```"):
        raw = "\n".join(raw.split("\n")[1:])
    if raw.endswith("```"):
        raw = "\n".join(raw.split("\n")[:-1])

    return raw.strip()


# ── 2. Direct LLM solve (simple / fallback) ───────────────────────────────────

DIRECT_SOLVE_SYSTEM = """You solve math and word problems with precision.

ARITHMETIC RULES — NEVER SKIP THESE:
- Compute every numerical sub-result explicitly before using it in the next step.
- For roots/powers: show the radicand first, then the result. E.g. "r³ = 5400/π ≈ 1718.87, r = ∛1718.87 ≈ 11.98"
- Verify by substituting your final answer back into the original equation. Show the check.
- Use 4+ decimal places for intermediates. Round only the final displayed answer.
- Check domain constraints (positive lengths, valid probabilities, etc.).

OUTPUT — respond with ONLY valid JSON (no markdown, no fences):
{"steps": ["step 1", "step 2", "step 3", "step 4", "step 5"], "answer": "final answer with units"}

Step guidelines:
- 4 to 6 steps
- Include: problem setup, key equation, substitution, numerical solve, verification
- Use math symbols: ×, ÷, =, ≈, π, √, ², ³, −, ∛
- answer: concise with units (e.g. "r ≈ 11.98 m, h ≈ 18.62 m, cost ≈ $135,251")
- For non-math input: {"steps": [], "answer": "Not a math problem"}"""


async def llm_direct_solve(problem: str) -> dict:
    """Claude solves directly — used for simple problems or as fallback."""
    raw = await _call(DIRECT_SOLVE_SYSTEM, problem, max_tokens=2048)

    # Extract JSON even if Claude wrapped it in text
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        import re
        m = re.search(r'\{[\s\S]*\}', raw)
        if m:
            try:
                parsed = json.loads(m.group(0))
            except Exception:
                parsed = {"steps": [], "answer": raw or "Error"}
        else:
            parsed = {"steps": [], "answer": raw or "Error"}

    return {
        "steps": parsed.get("steps", []),
        "answer": parsed.get("answer", "Error"),
        "verified": False,
        "method": "llm",
    }


# ── 3. Format SymPy result into human-readable steps ─────────────────────────

FORMAT_SYSTEM = """You are a math tutor. The problem has been solved correctly by a symbolic solver.
Your job is to take the raw solver output and make the explanation clean and readable.

- Rewrite steps to be clear English + math notation
- Use proper symbols: ×, ÷, =, ≈, π, √, ², ³, −, ∛
- Keep 4 to 6 steps
- Do NOT change any numbers — the solver is authoritative
- Output ONLY valid JSON: {"steps": [...], "answer": "..."}"""


async def format_verified_result(problem: str, raw_result: dict) -> dict:
    """Polish the step strings from a verified SymPy result."""
    user_msg = (
        f"Problem: {problem}\n\n"
        f"Solver steps (authoritative):\n"
        + "\n".join(f"- {s}" for s in raw_result.get("steps", []))
        + f"\n\nFinal answer: {raw_result.get('answer', '')}"
    )
    raw = await _call(FORMAT_SYSTEM, user_msg, max_tokens=1024)

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        import re
        m = re.search(r'\{[\s\S]*\}', raw)
        parsed = json.loads(m.group(0)) if m else {}

    return {
        "steps": parsed.get("steps", raw_result.get("steps", [])),
        "answer": parsed.get("answer", raw_result.get("answer", "")),
    }
