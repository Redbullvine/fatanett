# Relay Solver — Backend Math Engine

Five-lane verified math solver for fatanett.com/speed-test.

## Lane routing

| Lane | Status | Trigger | Cost |
|------|--------|---------|------|
| 1A | `LOCAL_VERIFIED` | Pure arithmetic expression | Free |
| 1B | `LOCAL_VERIFIED` | Known word problem pattern | Free |
| 2  | `LOCAL_SYMBOLIC_VERIFIED` | Optimization template (cylinder+hemisphere etc.) | Free |
| 3→4 | `VERIFIED_PREMIUM` | Advanced/expert + Opus + verification passed | ~$0.01–0.05 |
| — | `COMPUTE_OVERLOADED` | Verification failed, cap hit, timeout | Free |

## Deploy to Render (recommended)

1. Push `relay-solver/` to a GitHub repo (or use the same fatanett repo)
2. New Web Service on Render → connect repo
3. **Root directory:** `relay-solver`
4. **Build:** `pip install -r requirements.txt`
5. **Start:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Add env vars (see `.env.example`)
7. Copy the service URL

Then in Netlify → Environment variables:
```
SOLVER_URL=https://your-service.onrender.com
```

## Local development

```bash
cd relay-solver
pip install -r requirements.txt
cp .env.example .env
# fill in .env
uvicorn app.main:app --reload
```

## Run tests

```bash
cd relay-solver
pip install pytest
pytest tests/ -v
```

All 5 test files should pass with no Anthropic key needed
(premium escalation tests are classified-only, not API-calling).

## Test the reference problem

```bash
curl -X POST http://localhost:8000/solve \
  -H "Content-Type: application/json" \
  -d '{
    "problem": "A wastewater pond is a cylinder with hemispherical cap, volume 12000 m³. Cylinder walls $45/m², hemisphere $80/m², bottom free. Minimize cost.",
    "network_stats": {"ping_ms": 28, "download_mbps": 97, "upload_mbps": 8}
  }'
```

Expected response:
```json
{
  "ok": true,
  "status": "LOCAL_SYMBOLIC_VERIFIED",
  "verified": true,
  "method": "sympy",
  "answer_summary": "r ≈ 11.9788 m, h ≈ 18.6337 m, minimum cost ≈ $135,238.51",
  "verification": { "sympy_passed": true, "scipy_passed": true }
}
```

## Key rules (enforced in code)

- Never call Opus for arithmetic or simple word problems
- Never display an answer unless `verified: true`
- If verification fails → always return `COMPUTE_OVERLOADED` message
- Never cache `COMPUTE_OVERLOADED` or `verified: false` results
- Never expose `ANTHROPIC_API_KEY` or `WOLFRAM_APP_ID` to frontend
- `ANTHROPIC_PREMIUM_MODEL` is runtime-configurable — update env var only

## Adding new optimization templates

Edit `app/solvers/template_solver.py`.
Add a new `_solve_*` function and append it to `_TEMPLATES`.
Each template must:
1. Pattern-match the problem text
2. Solve deterministically (no LLM)
3. Verify by substituting back into constraints
4. Return `SolverResult` with `raw_values` and `constraint_checks`
