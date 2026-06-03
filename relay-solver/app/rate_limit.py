"""
Daily premium solve counter.
Resets at midnight UTC.
Thread-safe for single-process deployments.
For multi-process, use Redis INCR + EXPIREAT.
"""

import os
import time
from threading import Lock


_lock = Lock()
_date_str: str = ""
_count: int = 0


def _today() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def max_per_day() -> int:
    return int(os.getenv("MAX_PREMIUM_SOLVES_PER_DAY", "25"))


def check_and_increment() -> bool:
    """
    Returns True if a premium solve is allowed (and increments the counter).
    Returns False if the daily cap has been reached.
    """
    global _date_str, _count
    with _lock:
        today = _today()
        if _date_str != today:
            # New day — reset
            _date_str = today
            _count = 0
        if _count >= max_per_day():
            return False
        _count += 1
        return True


def remaining() -> int:
    global _date_str, _count
    with _lock:
        today = _today()
        if _date_str != today:
            return max_per_day()
        return max(0, max_per_day() - _count)


def current_count() -> int:
    with _lock:
        if _date_str != _today():
            return 0
        return _count
