#!/usr/bin/env python3
"""
Production-Grade Automated MongoDB Backup Script
Attendance Management System - Phase 5 Operations

Features:
- Encapsulated mongodump with --archive and --gzip compression
- Environment variable and CLI configuration with safe defaults
- Reliable cross-platform PID/file locking to prevent overlapping executions
- Strict credential and secret masking across logs and process calls
- Post-backup archive integrity verification
- Configurable retention rotation (prunes archives older than RETENTION_DAYS)
- Emits structured JSON summary and standardized POSIX exit codes
"""

import os
import re
import sys
import time
import json
import gzip
import shutil
import logging
import argparse
import subprocess
from pathlib import Path
from datetime import datetime, UTC, timedelta

# Standard Exit Codes
EXIT_SUCCESS = 0
EXIT_FAILURE = 1
EXIT_LOCKED = 2
EXIT_PREREQ_FAILED = 3

# Configure Logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("mongodb_backup")


def mask_credentials(text: str) -> str:
    """Mask user passwords and secrets from connection URIs and log lines."""
    if not text:
        return ""
    # Mask mongodb://user:pass@host and amqp://user:pass@host (handles passwords with @ or special chars)
    pattern = r"://([^/:]+):(.*)@([^/@]+)"
    return re.sub(pattern, r"://\1:***@\3", str(text))


class ProcessLock:
    """Cross-platform PID-based process lock to prevent overlapping backup runs."""

    def __init__(self, lock_path: Path):
        self.lock_path = lock_path
        self.acquired = False

    def acquire(self) -> bool:
        if self.lock_path.exists():
            try:
                content = self.lock_path.read_text().strip()
                lock_info = json.loads(content)
                pid = lock_info.get("pid")
                created_at = lock_info.get("created_at")

                # Check if PID is still alive
                if pid and self._is_pid_running(pid):
                    logger.error(
                        f"Lock collision: Backup already running under PID {pid} (started {created_at}). Aborting."
                    )
                    return False
                else:
                    logger.warning(f"Stale lock detected for dead PID {pid}. Overwriting lock.")
            except Exception as e:
                logger.warning(f"Invalid lock file format ({e}). Overwriting.")

        # Write fresh lock
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "pid": os.getpid(),
            "created_at": datetime.now(UTC).isoformat(),
        }
        self.lock_path.write_text(json.dumps(payload))
        self.acquired = True
        return True

    def release(self):
        if self.acquired and self.lock_path.exists():
            try:
                self.lock_path.unlink()
                self.acquired = False
            except Exception as e:
                logger.warning(f"Failed to remove lock file {self.lock_path}: {e}")

    @staticmethod
    def _is_pid_running(pid: int) -> bool:
        """Check whether process PID exists and is running."""
        if os.name == "nt":
            try:
                out = subprocess.check_output(
                    ["tasklist", "/FI", f"PID eq {pid}"], stderr=subprocess.DEVNULL
                ).decode("utf-8", errors="ignore")
                return str(pid) in out
            except Exception:
                return False
        else:
            try:
                os.kill(pid, 0)
                return True
            except OSError:
                return False

    def __enter__(self):
        if not self.acquire():
            sys.exit(EXIT_LOCKED)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()


def verify_archive_integrity(archive_path: Path) -> tuple[bool, str]:
    """Verify that the generated backup archive is non-empty and valid gzip format."""
    if not archive_path.exists():
        return False, "Archive file was not created on filesystem."

    size_bytes = archive_path.stat().st_size
    if size_bytes < 32:
        return False, f"Archive size {size_bytes} bytes is suspiciously small (< 32 bytes)."

    # Verify gzip magic number and readable stream
    try:
        with gzip.open(archive_path, "rb") as gz:
            chunk = gz.read(1024)
            if not chunk:
                return False, "Archive gzip payload is empty."
    except Exception as exc:
        return False, f"Gzip stream corruption detected: {exc}"

    return True, f"Integrity confirmed (gzip stream valid, size {size_bytes} bytes)."


def prune_expired_archives(backup_dir: Path, retention_days: int) -> list[str]:
    """Prune archives older than retention_days. Returns list of removed file names."""
    if retention_days <= 0:
        logger.info("Retention days <= 0; skipping archive rotation.")
        return []

    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    pruned = []

    for file_path in backup_dir.glob("attendance_db_backup_*.archive.gz"):
        try:
            mtime = datetime.fromtimestamp(file_path.stat().st_mtime, tz=UTC)
            if mtime < cutoff:
                logger.info(f"Pruning expired backup archive: {file_path.name} (age: {(datetime.now(UTC) - mtime).days} days)")
                file_path.unlink()
                # Also prune accompanying metadata json if it exists
                json_meta = file_path.with_suffix("").with_suffix(".json")
                if json_meta.exists():
                    json_meta.unlink()
                pruned.append(file_path.name)
        except Exception as e:
            logger.error(f"Failed to prune {file_path.name}: {e}")

    return pruned


def run_backup(
    mongo_db: str = "attendance_db",
    backup_dir: str = "backups",
    retention_days: int = 30,
    container_name: str = "attendance_mongodb",
    dry_run: bool = False,
) -> dict:
    """Execute automated MongoDB backup drill."""
    start_time = time.time()
    timestamp_str = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    backup_dir_path = Path(backup_dir).resolve()
    backup_dir_path.mkdir(parents=True, exist_ok=True)

    archive_filename = f"{mongo_db}_backup_{timestamp_str}.archive.gz"
    host_archive_path = backup_dir_path / archive_filename
    container_temp_path = f"/tmp/{archive_filename}"
    lock_file = backup_dir_path / ".backup.lock"

    logger.info("=" * 70)
    logger.info(f"MONGODB AUTOMATED BACKUP: {mongo_db}")
    logger.info(f"Destination: {host_archive_path}")
    logger.info(f"Retention: {retention_days} days")
    logger.info("=" * 70)

    summary = {
        "status": "FAILED",
        "database": mongo_db,
        "timestamp": datetime.now(UTC).isoformat(),
        "archive_filename": archive_filename,
        "archive_path": str(host_archive_path),
        "size_bytes": 0,
        "duration_seconds": 0.0,
        "integrity_check": "NOT_RUN",
        "retention_days": retention_days,
        "pruned_archives": [],
        "error": None,
    }

    if dry_run:
        logger.info("[DRY RUN] Simulating backup operations. No files written.")
        summary["status"] = "DRY_RUN_PASSED"
        return summary

    with ProcessLock(lock_file):
        # 1. Execute mongodump inside container
        dump_cmd = [
            "docker", "exec", container_name,
            "mongodump",
            f"--db={mongo_db}",
            f"--archive={container_temp_path}",
            "--gzip",
        ]
        logger.info(f"Executing: {' '.join(dump_cmd[:4])} --archive=... --gzip")

        try:
            res = subprocess.run(dump_cmd, capture_output=True, text=True, check=True)
            logger.info("mongodump completed successfully inside container.")
        except subprocess.CalledProcessError as err:
            sanitized_err = mask_credentials(err.stderr or err.stdout or str(err))
            logger.error(f"mongodump execution failed: {sanitized_err}")
            summary["error"] = sanitized_err
            return summary
        except Exception as e:
            logger.error(f"Subprocess dispatch error: {mask_credentials(str(e))}")
            summary["error"] = mask_credentials(str(e))
            return summary

        # 2. Copy archive from container to host backup directory
        copy_cmd = ["docker", "cp", f"{container_name}:{container_temp_path}", str(host_archive_path)]
        try:
            subprocess.run(copy_cmd, capture_output=True, text=True, check=True)
            logger.info(f"Archive copied to host: {host_archive_path}")
        except subprocess.CalledProcessError as err:
            err_msg = f"Failed to copy archive to host: {err.stderr}"
            logger.error(err_msg)
            summary["error"] = err_msg
            return summary

        # 3. Clean up container temporary archive
        try:
            subprocess.run(["docker", "exec", container_name, "rm", "-f", container_temp_path], capture_output=True)
        except Exception:
            pass

        # 4. Verify archive integrity
        valid, integrity_msg = verify_archive_integrity(host_archive_path)
        summary["integrity_check"] = integrity_msg
        if not valid:
            logger.error(f"Archive integrity verification failed: {integrity_msg}")
            summary["error"] = integrity_msg
            return summary

        summary["size_bytes"] = host_archive_path.stat().st_size
        logger.info(f"Integrity check passed: {integrity_msg}")

        # 5. Prune expired archives
        pruned = prune_expired_archives(backup_dir_path, retention_days)
        summary["pruned_archives"] = pruned
        if pruned:
            logger.info(f"Pruned {len(pruned)} expired backup file(s): {pruned}")

        summary["status"] = "SUCCESS"
        summary["duration_seconds"] = round(time.time() - start_time, 3)

        # 6. Write backup metadata JSON
        meta_path = host_archive_path.with_suffix("").with_suffix(".json")
        meta_path.write_text(json.dumps(summary, indent=2))
        logger.info(f"Backup manifest saved to: {meta_path}")
        logger.info("=" * 70)
        logger.info("BACKUP COMPLETED SUCCESSFULLY")
        logger.info("=" * 70)

    return summary


def main():
    parser = argparse.ArgumentParser(description="Automated Production-Grade MongoDB Backup Utility")
    parser.add_argument("--db", default=os.getenv("MONGO_DB", "attendance_db"), help="Source database name")
    parser.add_argument("--dir", default=os.getenv("BACKUP_DIR", "backups"), help="Backup destination directory")
    parser.add_argument(
        "--retention-days",
        type=int,
        default=int(os.getenv("RETENTION_DAYS", "30")),
        help="Number of days to retain backups",
    )
    parser.add_argument(
        "--container",
        default=os.getenv("MONGO_CONTAINER", "attendance_mongodb"),
        help="Docker container name running MongoDB",
    )
    parser.add_argument("--dry-run", action="store_true", help="Simulate backup without writing files")

    args = parser.parse_args()

    result = run_backup(
        mongo_db=args.db,
        backup_dir=args.dir,
        retention_days=args.retention_days,
        container_name=args.container,
        dry_run=args.dry_run,
    )

    if result["status"] in ["SUCCESS", "DRY_RUN_PASSED"]:
        sys.exit(EXIT_SUCCESS)
    else:
        sys.exit(EXIT_FAILURE)


if __name__ == "__main__":
    main()
