"""Proof/exhaustiveness routing helpers for Relay.

These checks keep Opus from receiving tasks that Relay cannot independently
verify with its numeric verifier.
"""

import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class Counterexample:
    summary: str
    detail: str


_BUNDLE_SPLIT_RE = re.compile(
    r"\(?\s*(?:alternatively|or,\s*if\s+you\s+want|if\s+you\s+want\s+something)\b",
    re.IGNORECASE,
)
_COMPUTATIONAL_LABEL_RE = re.compile(
    r"\b(?:harder\s+)?computational\s+version\s*:\s*",
    re.IGNORECASE,
)


def split_subproblems(problem: str) -> list[str]:
    """Split obvious bundled prompts into separately verifiable tasks."""
    text = problem.strip()
    if not text:
        return []

    label_match = _COMPUTATIONAL_LABEL_RE.search(text)
    alt_match = _BUNDLE_SPLIT_RE.search(text)

    if not label_match and not alt_match:
        return [text]

    first_end = alt_match.start() if alt_match else label_match.start()
    first = text[:first_end].strip(" ()\n\t")

    if label_match:
        second = text[label_match.end():].strip(" ()\n\t")
    else:
        second = text[alt_match.end():].strip(" ()\n\t")

    parts = [part for part in (first, second) if part]
    return parts if len(parts) > 1 else [text]


def has_multiple_clear_tasks(problem: str) -> bool:
    return len(split_subproblems(problem)) > 1


def find_odd_prime_statement_counterexample(problem: str) -> Optional[Counterexample]:
    """
    Check the known universal odd-prime proof pattern against small primes.

    The pasted problem claims every odd prime p has infinitely many n satisfying
    a first-hit congruence. A single odd prime with no valid residue class mod p
    disproves the universal statement.
    """
    text = problem.lower()
    required_signals = [
        r"\bodd\s+prime\b",
        r"\binfinitely\s+many\b",
        r"\bp\b[\s$]*divides\b",
        r"n\^\{?2\^\{?p-1\}?\}?",
        r"\bfor\s+any\b[\s$]*k\s*<\s*p-1\b",
    ]
    if not all(re.search(pattern, text) for pattern in required_signals):
        return None

    for p in (3, 5, 7, 11, 13):
        valid_residues = []
        for n in range(p):
            target_hit = (pow(n, 2 ** (p - 1), p) - 2) % p == 0
            earlier_hit = any((pow(n, 2 ** k, p) - 2) % p == 0 for k in range(p - 1))
            if target_hit and not earlier_hit:
                valid_residues.append(n)

        if not valid_residues:
            return Counterexample(
                summary=f"The statement is false as written. Counterexample: p = {p}.",
                detail=(
                    f"For p = {p}, checking every residue n mod {p} gives no residue with "
                    f"n^(2^(p-1)) ≡ 2 mod {p} while avoiding n^(2^k) ≡ 2 mod {p} "
                    f"for all k < p-1. Therefore no positive integer n can satisfy the "
                    f"claimed condition for this prime."
                ),
            )

    return None
