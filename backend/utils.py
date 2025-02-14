import asyncio
from datetime import datetime, timedelta
from typing import Coroutine

def now():
    return datetime.utcnow().isoformat()

def now_delta(seconds: int):
    delta = timedelta(seconds=seconds)
    return (datetime.utcnow() + delta).isoformat()

background_tasks = set()

async def delay_task(delay: float, coro: Coroutine):
    """Sleep for delay seconds then await coro."""
    await asyncio.sleep(delay)
    await coro

def start_background_task(coro: Coroutine):
    """Schedule execution of coro at the next opportunity.
    Returned object can be used to cancel the event."""
    t = asyncio.create_task(coro)
    background_tasks.add(t)
    t.add_done_callback(background_tasks.discard)
    return t

def get_keys(d: dict, keys: list):
    """Get a dict with only the specified keys (if they exist)."""
    return {k: d[k] for k in keys if k in d}

def exclude_keys(d: dict, keys: list):
    """Get a dict without the specified keys."""
    return {k:v for k,v in d.items() if k not in keys}

def unfriend(u1, u2):
    """Unfriend both users. Assumes already friends."""
    # Cursed db import because it would make a circular dependency otherwise.
    import database as db
    if db.is_relation(u1, u2, "friend"):
        # Relation is from 1 to 2.
        db.delete_relation(u1, u2)
    else:
        # Relation is from 2 to 1.
        db.delete_relation(u2, u1)
