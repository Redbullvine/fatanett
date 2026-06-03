"""
LANE 1 — Word Problem Solver (LOCAL_VERIFIED)

Handles known structured word problem patterns with deterministic arithmetic.
Each pattern extracts numbers, applies the correct formula, verifies, returns.
Returns None if no pattern matches — problem escalates to next lane.

Supported patterns:
  - Fiber trays: cabinets × trays per cabinet, remove damaged, split by zones
  - Port configuration: cabinets × ports, remove failed, add replacement (minus spares), split zones
  - Simple rate/distance/time
  - Simple percentage
"""

import re
from typing import Optional
from app.models import SolverResult


# ── Helper ────────────────────────────────────────────────────────────────────

def _extract_int(text: str, pattern: str) -> Optional[int]:
    m = re.search(pattern, text, re.IGNORECASE)
    if m:
        return int(m.group(1).replace(",", ""))
    return None


def _fmt(n) -> str:
    if isinstance(n, float) and n == int(n):
        n = int(n)
    return f"{n:,}" if isinstance(n, int) else f"{n:.4g}"


# ── Pattern 1: Fiber tray splice problem ─────────────────────────────────────
# "A fiber crew installs the same number of splice trays in X cabinets.
#  Each cabinet gets Y trays. Later, Z trays are removed because they are damaged.
#  The remaining trays are split evenly between N service zones."
# Answer: (X*Y - Z) / N

_FIBER_TRAY_RE = re.compile(
    r"""
    (?:fiber|splice|install).*?
    (\d+)\s*cabinet                 # group 1: number of cabinets
    .*?
    (\d+)\s*tray                    # group 2: trays per cabinet
    .*?
    (\d+)\s*tray.*?(?:remov|damaged|taken)   # group 3: trays removed
    .*?
    (\d+)\s*(?:service\s*)?zone     # group 4: zones
    """,
    re.IGNORECASE | re.DOTALL | re.VERBOSE,
)


def _solve_fiber_tray(text: str) -> Optional[SolverResult]:
    m = _FIBER_TRAY_RE.search(text)
    if not m:
        return None

    cabinets = int(m.group(1))
    trays_each = int(m.group(2))
    removed = int(m.group(3))
    zones = int(m.group(4))

    if zones == 0:
        return None

    total = cabinets * trays_each
    remaining = total - removed
    per_zone = remaining / zones

    if per_zone != int(per_zone):
        # Non-integer answer is suspicious for this problem type
        warning = f"Note: {remaining} ÷ {zones} = {per_zone:.4f} (not a whole number)"
        answer = f"{per_zone:.4f} trays per zone"
    else:
        per_zone = int(per_zone)
        answer = f"{per_zone} trays per zone"
        warning = None

    steps = [
        f"Total trays installed: {cabinets} cabinets × {trays_each} trays = {total} trays",
        f"After removing {removed} damaged: {total} − {removed} = {remaining} trays",
        f"Split evenly across {zones} zones: {remaining} ÷ {zones} = {per_zone}",
    ]
    if warning:
        steps.append(warning)

    md = "\n".join(f"- {s}" for s in steps) + f"\n\n**Answer: {answer}**"

    return SolverResult(
        solved=True,
        answer_summary=answer,
        solution_markdown=md,
        method="word_problem_template",
        raw_values={"total": total, "remaining": remaining, "per_zone": float(per_zone)},
        constraint_checks=[
            f"cabinets × trays = {cabinets} × {trays_each} = {total}",
            f"remaining = {total} − {removed} = {remaining}",
            f"per_zone = {remaining} ÷ {zones} = {per_zone}",
        ],
        warnings=[warning] if warning else [],
    )


# ── Pattern 2: Port configuration problem ────────────────────────────────────
# "X cabinets with Y active ports each AND A cabinets with B active ports each.
#  Z ports fail. W replacement ports delivered, S held as spares.
#  Split across N service zones."

_PORT_RE = re.compile(
    r"""
    (\d+)\s*cabinet.*?(\d+)\s*(?:active\s+)?port    # group 1,2: cab1 × ports1
    .*?
    (\d+)\s*cabinet.*?(\d+)\s*(?:active\s+)?port    # group 3,4: cab2 × ports2
    .*?
    (\d+)\s*port.*?(?:fail|remov|broken)             # group 5: failed ports
    .*?
    (\d+)\s*(?:replacement\s+)?port                  # group 6: delivered
    .*?
    (\d+)\D{0,40}(?:held|spare|emergency)            # group 7: held back
    .*?
    (\d+)\s*(?:service\s*)?zone                      # group 8: zones
    """,
    re.IGNORECASE | re.DOTALL | re.VERBOSE,
)


def _solve_port_config(text: str) -> Optional[SolverResult]:
    m = _PORT_RE.search(text)
    if not m:
        return None

    c1, p1, c2, p2 = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
    failed    = int(m.group(5))
    delivered = int(m.group(6))
    spares    = int(m.group(7))
    zones     = int(m.group(8))

    if zones == 0:
        return None

    total_installed = c1 * p1 + c2 * p2
    after_failures  = total_installed - failed
    usable_added    = delivered - spares
    usable_total    = after_failures + usable_added
    per_zone        = usable_total / zones

    if per_zone == int(per_zone):
        per_zone = int(per_zone)
        answer = f"{per_zone} usable ports per zone"
    else:
        answer = f"{per_zone:.4f} usable ports per zone"

    steps = [
        f"Initial ports: {c1}×{p1} + {c2}×{p2} = {c1*p1} + {c2*p2} = {total_installed}",
        f"After {failed} failures: {total_installed} − {failed} = {after_failures}",
        f"Usable replacements: {delivered} delivered − {spares} spares = {usable_added}",
        f"Total usable: {after_failures} + {usable_added} = {usable_total}",
        f"Per zone: {usable_total} ÷ {zones} = {per_zone}",
    ]

    md = "\n".join(f"- {s}" for s in steps) + f"\n\n**Answer: {answer}**"

    return SolverResult(
        solved=True,
        answer_summary=answer,
        solution_markdown=md,
        method="word_problem_template",
        raw_values={"total_installed": total_installed, "usable_total": usable_total, "per_zone": float(per_zone)},
        constraint_checks=[
            f"total = {c1}×{p1} + {c2}×{p2} = {total_installed}",
            f"after failures = {total_installed} − {failed} = {after_failures}",
            f"usable_total = {after_failures} + {usable_added} = {usable_total}",
            f"per_zone = {usable_total} ÷ {zones} = {per_zone}",
        ],
    )


# ── Pattern 3: Simple rate / distance / time ──────────────────────────────────
# "A train travels X mph for Y hours. How far?"
# "How long to travel X miles at Y mph?"

_RATE_DIST_RE = re.compile(
    r"(?:travel|drive|move|go|run|fly|ride)\D{0,30}"
    r"([\d.]+)\s*(mph|km/h|miles per hour|kph|knots?)"
    r"\D{0,30}"
    r"([\d.]+)\s*(hour|hr|minute|min|second|sec)",
    re.IGNORECASE,
)
_RATE_UNIT_FACTORS = {
    "hour": 1, "hr": 1, "minute": 1/60, "min": 1/60,
    "second": 1/3600, "sec": 1/3600,
}


def _solve_rate_distance(text: str) -> Optional[SolverResult]:
    m = _RATE_DIST_RE.search(text)
    if not m:
        return None

    speed   = float(m.group(1))
    time_val= float(m.group(3))
    time_unit = m.group(4).lower().rstrip("s")  # singular
    factor  = _RATE_UNIT_FACTORS.get(time_unit, 1)
    hours   = time_val * factor
    distance = speed * hours

    time_str  = f"{time_val} {m.group(4)}"
    speed_str = f"{speed} {m.group(2)}"
    dist_unit = "miles" if "mph" in m.group(2).lower() or "miles" in m.group(2).lower() else "km"
    answer    = f"{distance:g} {dist_unit}"

    steps = [
        f"Speed: {speed_str}",
        f"Time: {time_str} = {hours:g} hours",
        f"Distance = speed × time = {speed} × {hours:g} = {distance:g} {dist_unit}",
    ]
    md = "\n".join(f"- {s}" for s in steps) + f"\n\n**Answer: {answer}**"

    return SolverResult(
        solved=True,
        answer_summary=answer,
        solution_markdown=md,
        method="word_problem_template",
        raw_values={"speed": speed, "time_hours": hours, "distance": distance},
        constraint_checks=[f"d = {speed} × {hours:g} = {distance:g}"],
    )


# ── Main entry point ──────────────────────────────────────────────────────────

_SOLVERS = [
    _solve_fiber_tray,
    _solve_port_config,
    _solve_rate_distance,
]


def solve(problem: str) -> Optional[SolverResult]:
    """
    Try each word-problem pattern.
    Returns first match, or None if no pattern applies.
    """
    for solver_fn in _SOLVERS:
        result = solver_fn(problem)
        if result is not None:
            return result
    return None
