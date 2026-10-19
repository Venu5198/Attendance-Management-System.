"""Redis-backed request deduplication and idempotency engine.

Ensures that duplicate or identical concurrent requests are only processed once,
preventing duplicate background tasks, double check-ins, and repeated database writes.
"""

import hashlib
import json
import logging
import time
from typing import Any

from redis.exceptions import RedisError

from app.core.redis_client import redis_manager

logger = logging.getLogger(__name__)


def compute_request_fingerprint(
    tenant_id: str,
    method: str,
    path: str,
    user_id: str = "anonymous",
    body: bytes | str | None = None,
    idempotency_key: str | None = None,
) -> str:
    """Generate a unique deterministic SHA-256 fingerprint for a request."""
    if idempotency_key and idempotency_key.strip():
        # Explicit client-supplied idempotency key takes precedence
        raw = f"{tenant_id}:{user_id}:{idempotency_key.strip()}"
    else:
        body_str = ""
        if isinstance(body, bytes):
            body_str = hashlib.sha256(body).hexdigest()
        elif isinstance(body, str):
            body_str = hashlib.sha256(body.encode("utf-8")).hexdigest()
        raw = f"{tenant_id}:{user_id}:{method.upper()}:{path}:{body_str}"

    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def acquire_deduplication(
    fingerprint: str,
    ttl_seconds: int = 120,
) -> tuple[bool, dict[str, Any] | None]:
    """
    Attempt to acquire exclusive processing rights for this request fingerprint.

    Returns:
        (can_process: bool, existing_record: dict | None)
        - If (True, None): this is the first request. The caller MUST proceed and later call complete_deduplication.
        - If (False, {"status": "IN_PROGRESS"}): another identical request is currently being processed.
        - If (False, {"status": "COMPLETED", ...}): identical request was already processed; cached response included.
    """
    redis_key = f"dedup:{fingerprint}"
    now = time.time()

    if redis_manager.is_available and redis_manager.client:
        try:
            # Check if key already exists
            existing_json = await redis_manager.client.get(redis_key)
            if existing_json:
                try:
                    record = json.loads(existing_json)
                    return False, record
                except Exception:
                    return False, {"status": "IN_PROGRESS"}

            # Atomically set IN_PROGRESS
            payload = json.dumps({"status": "IN_PROGRESS", "created_at": now})
            acquired = await redis_manager.client.set(
                redis_key,
                payload,
                nx=True,
                ex=ttl_seconds,
            )
            if acquired:
                return True, None
            else:
                # Lost race to another identical request
                existing_json = await redis_manager.client.get(redis_key)
                if existing_json:
                    record = json.loads(existing_json)
                    return False, record
                return False, {"status": "IN_PROGRESS"}
        except RedisError as exc:
            logger.warning("Redis deduplication error: %s. Using resilient fallback.", exc)

    # In-memory fallback
    if redis_key in redis_manager._fallback_store:
        exp = redis_manager._fallback_expirations.get(redis_key, 0)
        if now < exp:
            return False, redis_manager._fallback_store[redis_key]
        else:
            redis_manager._fallback_store.pop(redis_key, None)

    # Store IN_PROGRESS in fallback
    in_prog = {"status": "IN_PROGRESS", "created_at": now}
    redis_manager._fallback_store[redis_key] = in_prog
    redis_manager._fallback_expirations[redis_key] = now + ttl_seconds
    return True, None


async def complete_deduplication(
    fingerprint: str,
    status_code: int,
    response_data: Any,
    ttl_seconds: int = 120,
) -> None:
    """Store the completed result of the request to serve identical future hits directly."""
    redis_key = f"dedup:{fingerprint}"
    payload_dict = {
        "status": "COMPLETED",
        "status_code": status_code,
        "data": response_data,
        "completed_at": time.time(),
    }
    payload_json = json.dumps(payload_dict, default=str)

    if redis_manager.is_available and redis_manager.client:
        try:
            await redis_manager.client.set(redis_key, payload_json, ex=ttl_seconds)
            return
        except RedisError as exc:
            logger.warning("Failed to store deduplicated completion in Redis: %s", exc)

    redis_manager._fallback_store[redis_key] = payload_dict
    redis_manager._fallback_expirations[redis_key] = time.time() + ttl_seconds


async def release_deduplication(fingerprint: str) -> None:
    """Release or abort the deduplication key upon unhandled failure so the user can retry."""
    redis_key = f"dedup:{fingerprint}"
    if redis_manager.is_available and redis_manager.client:
        try:
            await redis_manager.client.delete(redis_key)
            return
        except RedisError:
            pass

    redis_manager._fallback_store.pop(redis_key, None)
    redis_manager._fallback_expirations.pop(redis_key, None)
