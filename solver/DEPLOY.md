# Relay Solver — Deployment Guide

## Deploy to Railway (recommended, free tier available)

1. Install Railway CLI:
   ```
   npm install -g @railway/cli
   railway login
   ```

2. From the `solver/` directory:
   ```
   cd solver
   railway init          # creates a new Railway project
   railway up            # deploys the Dockerfile
   ```

3. Set the environment variable in Railway dashboard:
   ```
   ANTHROPIC_API_KEY = your_key_here
   ```

4. Railway gives you a URL like `https://relay-solver-xxxx.railway.app`

5. Add that URL to Netlify environment variables:
   ```
   SOLVER_URL = https://relay-solver-xxxx.railway.app
   ```
   (Netlify → Site → Environment variables)

6. Redeploy Netlify (or it picks up on next git push).

---

## Local development

```bash
cd solver
pip install -r requirements.txt
ANTHROPIC_API_KEY=sk-... uvicorn main:app --reload
```

Test it:
```bash
curl -X POST http://localhost:8000/solve \
  -H "Content-Type: application/json" \
  -d '{"problem": "A wastewater pond is a cylinder with hemispherical cap, volume 12000 m³. Cylinder walls $45/m², hemisphere $80/m², bottom free. Minimize cost."}'
```

Expected: r ≈ 11.98 m, h ≈ 18.62 m, cost ≈ $135,251, verified: true

---

## How it works

```
User input
    │
    ▼
classify_problem()
    │
    ├── simple ──────────────────► Claude direct (fast)
    │
    └── medium / advanced
            │
            ▼
      generate_sympy_code()   ← Claude writes Python/SymPy code
            │
            ▼
      execute_sympy_code()    ← Safe sandboxed exec (no OS/network)
            │
            ▼
      verify_optimization()   ← Plug answer back into constraints
            │
        verified?
         ├── YES ► format_verified_result() → Claude polishes steps
         └── NO  ► llm_direct_solve() with transparency warning
```

## Adding Wolfram Alpha (optional upgrade)

Set `WOLFRAM_APP_ID` env var. In `math_engine.py`, add a `wolfram_solve()` 
function that POSTs to `https://api.wolframalpha.com/v2/query` and parses 
the result. Insert it as a second verification step after SymPy.
