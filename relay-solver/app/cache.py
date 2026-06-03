"""
Simple in-memory 24-hour result cache.
Keys are SHA-256 hashes of normalized problem text.
No user PII is stored — only the hash and the solver response.

For production at scale, swap the dict for Redis:
  redis_client.setex(key, ttl_seconds, json.dumps(value))
"""

import hashlib
import os
import re
import time
from typing import Optional


_store: dict[str, tuple[float, dict]] = {}   # key → (timestamp, response_dict)


def _ttl_seconds() -> int:
    return int(os.getenv("CACHE_TTL_HOURS", "24")) * 3600


def normalize(problem: str) -> str:
    """
    Normalize problem text for cache key generation.
    Strips whitespace, lowercases, collapses runs of spaces.
    Preserves numbers and punctuation (important for math).
    """
    text = problem.strip().lower()
    text = re.sub(r"\s+", " ", text)
    # Normalize common Unicode math characters
    text = text.replace("−", "-").replace("×", "*").replace("÷", "/")
    return text


def cache_key(problem: str) -> str:
    """SHA-256 of the normalized problem text."""
    return hashlib.sha256(normalize(problem).encode()).hexdigest()


def get(problem: str) -> Optional[dict]:
    """Return cached response dict if present and not expired."""
    key   = cache_key(problem)
    entry = _store.get(key)
    if entry is None:
        return None
    ts, data = entry
    if time.time() - ts > _ttl_seconds():
        del _store[key]
        return None
    return data


def put(problem: str, response: dict) -> None:
    """
    Cache a response.
    Only cache verified or LOCAL_* results — never cache COMPUTE_OVERLOADED.
    """
    status = response.get("status", "")
    if status == "COMPUTE_OVERLOADED" or not response.get("verified", False):
        return  # never cache failures or unverified results
    key = cache_key(problem)
    _store[key] = (time.time(), response)


def evict_expired() -> int:
    """Remove all expired entries. Returns count removed."""
    now     = time.time()
    ttl     = _ttl_seconds()
    expired = [k for k, (ts, _) in _store.items() if now - ts > ttl]
    for k in expired:
        del _store[k]
    return len(expired)


def size() -> int:
    return len(_store)
