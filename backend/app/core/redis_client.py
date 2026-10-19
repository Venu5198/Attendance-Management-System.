"""Redis async client management, distributed locking, caching, and token blacklisting."""

import asyncio
import json
import logging
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

import redis.asyncio as aioredis
from redis.exceptions import RedisError

from app.config import get_settings

logger = logging.getLogger(__name__)


class RedisManager:
    client: aioredis.Redis | None = None
    is_available: bool = False
    _fallback_store: dict[str, Any] = {}
    _fallback_expirations: dict[str, float] = {}
    _fallback_locks: dict[str, asyncio.Lock] = {}


redis_manager = RedisManager()


async def connect_to_redis() -> aioredis.Redis | None:
    """Connect to Redis with non-blocking graceful fallback if offline."""
    settings = get_settings()
    if not settings.REDIS_ENABLED:
        logger.info("Redis is disabled in configuration. Using in-memory fallback store.")
        redis_manager.is_available = False
        return None

    try:
        client = aioredis.from_url(
            settings.REDIS_URI,
            decode_responses=True,
            socket_timeout=2.0,
            socket_connect_timeout=2.0,
        )
        await client.ping()
        redis_manager.client = client
        redis_manager.is_available = True
        logger.info("Successfully connected to Redis at %s", settings.REDIS_URI)
        return client
    except Exception as exc:
        logger.warning(
            "Redis connection unavailable at %s (%s). Falling back to resilient in-memory operations.",
            settings.REDIS_URI,
            exc,
        )
        redis_manager.client = None
        redis_manager.is_available = False
        return None


async def close_redis_connection() -> None:
    """Gracefully close Redis connection pool."""
    if redis_manager.client:
        try:
            await redis_manager.client.aclose()
        except Exception:
            pass
        redis_manager.client = None
        redis_manager.is_available = False
        logger.info("Closed Redis connection.")


# ---------------------------------------------------------
# Distributed Locking (Concurrency & Race Condition Safety)
# ---------------------------------------------------------
@asynccontextmanager
async def redis_distributed_lock(
    lock_key: str,
    timeout_seconds: float = 10.0,
    acquire_timeout: float = 3.0,
) -> AsyncGenerator[bool, None]:
    """
    Acquire a distributed mutex lock.
    Guarantees concurrency safety for employee check-ins and report runs.
    """
    acquired = False
    token = str(time.time())
    full_key = f"lock:{lock_key}"

    if redis_manager.is_available and redis_manager.client:
        start_time = time.time()
        while time.time() - start_time < acquire_timeout:
            try:
                ok = await redis_manager.client.set(
                    full_key,
                    token,
                    nx=True,
                    ex=int(timeout_seconds),
                )
                if ok:
                    acquired = True
                    break
            except RedisError:
                break
            await asyncio.sleep(0.05)

        try:
            yield acquired
        finally:
            if acquired and redis_manager.client:
                # Lua script release or safe delete
                try:
                    val = await redis_manager.client.get(full_key)
                    if val == token:
                        await redis_manager.client.delete(full_key)
                except RedisError:
                    pass
    else:
        # In-memory lock fallback
        if full_key not in redis_manager._fallback_locks:
            redis_manager._fallback_locks[full_key] = asyncio.Lock()
        lock = redis_manager._fallback_locks[full_key]
        try:
            await asyncio.wait_for(lock.acquire(), timeout=acquire_timeout)
            acquired = True
            yield acquired
        except TimeoutError:
            yield False
        finally:
            if acquired and lock.locked():
                lock.release()


# ---------------------------------------------------------
# Token Blacklisting (Authentication & Token Revocation)
# ---------------------------------------------------------
async def blacklist_token(token_jti_or_signature: str, ttl_seconds: int = 28800) -> None:
    """Blacklist a revoked JWT token until its natural expiration."""
    key = f"jwt:blacklist:{token_jti_or_signature}"
    if redis_manager.is_available and redis_manager.client:
        try:
            await redis_manager.client.set(key, "revoked", ex=ttl_seconds)
            return
        except RedisError:
            pass

    # Fallback store
    redis_manager._fallback_store[key] = "revoked"
    redis_manager._fallback_expirations[key] = time.time() + ttl_seconds


async def is_token_blacklisted(token_jti_or_signature: str) -> bool:
    """Check if token is present in blacklist."""
    key = f"jwt:blacklist:{token_jti_or_signature}"
    if redis_manager.is_available and redis_manager.client:
        try:
            res = await redis_manager.client.get(key)
            return res is not None
        except RedisError:
            pass

    # Fallback check
    if key in redis_manager._fallback_store:
        if time.time() < redis_manager._fallback_expirations.get(key, 0):
            return True
        else:
            redis_manager._fallback_store.pop(key, None)
            redis_manager._fallback_expirations.pop(key, None)
    return False


# ---------------------------------------------------------
# Cache-Aside Operations (Performance & Caching)
# ---------------------------------------------------------
async def cache_get(key: str) -> Any | None:
    """Get deserialized JSON item from cache."""
    cache_key = f"cache:{key}"
    if redis_manager.is_available and redis_manager.client:
        try:
            raw = await redis_manager.client.get(cache_key)
            if raw:
                return json.loads(raw)
        except (RedisError, json.JSONDecodeError):
            pass
        return None

    if cache_key in redis_manager._fallback_store:
        if time.time() < redis_manager._fallback_expirations.get(cache_key, 0):
            return redis_manager._fallback_store[cache_key]
        redis_manager._fallback_store.pop(cache_key, None)
    return None


async def cache_set(key: str, value: Any, ttl_seconds: int = 300) -> None:
    """Save serializable item in cache with TTL."""
    cache_key = f"cache:{key}"
    if redis_manager.is_available and redis_manager.client:
        try:
            raw = json.dumps(value, default=str)
            await redis_manager.client.set(cache_key, raw, ex=ttl_seconds)
            return
        except RedisError:
            pass

    redis_manager._fallback_store[cache_key] = value
    redis_manager._fallback_expirations[cache_key] = time.time() + ttl_seconds


async def cache_delete(key: str) -> None:
    """Delete single key from cache."""
    cache_key = f"cache:{key}"
    if redis_manager.is_available and redis_manager.client:
        try:
            await redis_manager.client.delete(cache_key)
        except RedisError:
            pass
    redis_manager._fallback_store.pop(cache_key, None)


# ---------------------------------------------------------
# Rate Limiting (Performance, Security & Networking)
# ---------------------------------------------------------
async def is_rate_limited(identifier: str, limit: int = 60, window_seconds: int = 60) -> tuple[bool, int]:
    """
    Sliding window or fixed window rate limiter.
    Returns (is_limited, remaining_requests).
    """
    key = f"ratelimit:{identifier}:{int(time.time() // window_seconds)}"
    if redis_manager.is_available and redis_manager.client:
        try:
            current = await redis_manager.client.incr(key)
            if current == 1:
                await redis_manager.client.expire(key, window_seconds + 5)
            if current > limit:
                return True, 0
            return False, limit - current
        except RedisError:
            return False, limit

    # Fallback in-memory
    current = redis_manager._fallback_store.get(key, 0) + 1
    redis_manager._fallback_store[key] = current
    redis_manager._fallback_expirations[key] = time.time() + window_seconds
    if current > limit:
        return True, 0
    return False, limit - current
