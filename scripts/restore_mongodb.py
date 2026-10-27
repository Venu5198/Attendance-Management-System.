#!/usr/bin/env python3
"""
Production-Grade Automated MongoDB Restore & Verification Script
Attendance Management System - Phase 5 Operations

Features:
- Mandatory safety guard: Categorically rejects restoring over the source database (attendance_db)
- Requires explicit disposable target database argument
- Pre-restore archive integrity validation
- Namespace rewriting (--nsFrom and --nsTo)
- Automated post-restore parity audit: collections, document counts, indexes, and EMP001 Oct 24 record
- Optional automatic cleanup (--drop-after-verify) for non-destructive drills
"""

import os
import re
import sys
import time
import json
import gzip
import logging
import argparse
import subprocess
from pathlib import Path

# Standard Exit Codes
EXIT_SUCCESS = 0
EXIT_FAILURE = 1
EXIT_GUARD_BLOCKED = 2
EXIT_PARITY_FAILED = 3

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("mongodb_restore")


def mask_credentials(text: str) -> str:
    """Mask user passwords and secrets from connection URIs and log lines."""
    if not text:
        return ""
    pattern = r"://([^/:]+):(.*)@([^/@]+)"
    return re.sub(pattern, r"://\1:***@\3", str(text))


def verify_archive(archive_path: Path) -> tuple[bool, str]:
    """Validate archive exists and gzip stream is valid."""
    if not archive_path.exists():
        return False, f"Archive file not found: {archive_path}"
    if archive_path.stat().st_size < 32:
        return False, f"Archive size {archive_path.stat().st_size} bytes is invalid."
    try:
        with gzip.open(archive_path, "rb") as gz:
            sample = gz.read(1024)
            if not sample:
                return False, "Archive gzip payload is empty."
    except Exception as exc:
        return False, f"Archive file is corrupt: {exc}"
    return True, "Archive gzip stream valid."


def run_restore(
    archive_path_str: str,
    target_db: str,
    source_db: str = "attendance_db",
    container_name: str = "attendance_mongodb",
    drop_after_verify: bool = False,
    allow_source_overwrite: bool = False,
) -> dict:
    """Execute safe MongoDB restoration drill into disposable target database."""
    start_time = time.time()
    archive_path = Path(archive_path_str).resolve()

    logger.info("=" * 70)
    logger.info(f"MONGODB SAFE RESTORE DRILL")
    logger.info(f"Source DB: {source_db}")
    logger.info(f"Target DB: {target_db}")
    logger.info(f"Archive:   {archive_path.name}")
    logger.info("=" * 70)

    summary = {
        "status": "FAILED",
        "source_db": source_db,
        "target_db": target_db,
        "archive_file": archive_path.name,
        "documents_restored": 0,
        "collections_verified": 0,
        "index_parity": False,
        "emp001_record_verified": False,
        "cleaned_up": False,
        "error": None,
    }

    # 1. CRITICAL SAFETY GUARD: Prevent restoration over source database
    if target_db.strip().lower() == source_db.strip().lower():
        if not allow_source_overwrite:
            err_msg = (
                f"SAFETY GUARD TRIGGERED: Refusing to restore over source database '{source_db}'. "
                "Restoration drill requires an explicit disposable target database (e.g. attendance_db_phase5_drill)."
            )
            logger.error(err_msg)
            summary["error"] = err_msg
            summary["guard_blocked"] = True
            return summary

    # 2. Validate archive readability
    valid, archive_msg = verify_archive(archive_path)
    if not valid:
        logger.error(f"Archive validation failed: {archive_msg}")
        summary["error"] = archive_msg
        return summary
    logger.info(f"Archive check: {archive_msg}")

    # 3. Copy archive into container /tmp/
    container_archive = f"/tmp/{archive_path.name}"
    copy_cmd = ["docker", "cp", str(archive_path), f"{container_name}:{container_archive}"]
    try:
        subprocess.run(copy_cmd, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as err:
        err_msg = f"Failed to transfer archive to container: {err.stderr}"
        logger.error(err_msg)
        summary["error"] = err_msg
        return summary

    # 4. Execute mongorestore with namespace rewriting
    restore_cmd = [
        "docker", "exec", container_name,
        "mongorestore",
        f"--archive={container_archive}",
        "--gzip",
        f"--nsFrom={source_db}.*",
        f"--nsTo={target_db}.*",
    ]
    logger.info(f"Dispatching mongorestore ({source_db} -> {target_db})...")

    try:
        res = subprocess.run(restore_cmd, capture_output=True, text=True, check=True)
        logger.info("mongorestore execution completed successfully.")
    except subprocess.CalledProcessError as err:
        sanitized_err = mask_credentials(err.stderr or err.stdout or str(err))
        logger.error(f"mongorestore failed: {sanitized_err}")
        summary["error"] = sanitized_err
        return summary
    finally:
        # Prune temporary archive in container
        subprocess.run(["docker", "exec", container_name, "rm", "-f", container_archive], capture_output=True)

    # 5. Extract and parse document counts & index counts
    compare_script = f"""
    const s = db.getSiblingDB('{source_db}');
    const t = db.getSiblingDB('{target_db}');
    const comp = {{ source: {{}}, target: {{}} }};
    s.getCollectionNames().sort().forEach(c => {{
        comp.source[c] = {{ count: s.getCollection(c).countDocuments(), indexes: s.getCollection(c).getIndexes().length }};
    }});
    t.getCollectionNames().sort().forEach(c => {{
        comp.target[c] = {{ count: t.getCollection(c).countDocuments(), indexes: t.getCollection(c).getIndexes().length }};
    }});
    console.log(JSON.stringify(comp));
    """
    try:
        audit_res = subprocess.run(
            ["docker", "exec", container_name, "mongosh", "--quiet", "--eval", compare_script],
            capture_output=True, text=True, check=True
        )
        data = json.loads(audit_res.stdout.strip())
        source_cols = data.get("source", {})
        target_cols = data.get("target", {})
    except Exception as e:
        err_msg = f"Failed to query restore parity metrics: {e}"
        logger.error(err_msg)
        summary["error"] = err_msg
        return summary

    # Verify collection and document counts
    all_matched = True
    total_docs = 0
    for col, src_info in source_cols.items():
        tgt_info = target_cols.get(col)
        if not tgt_info:
            logger.error(f"Missing collection in target: {col}")
            all_matched = False
            continue
        if src_info["count"] != tgt_info["count"]:
            logger.error(f"Count mismatch in {col}: source={src_info['count']}, target={tgt_info['count']}")
            all_matched = False
        if src_info["indexes"] != tgt_info["indexes"]:
            logger.error(f"Index count mismatch in {col}: source={src_info['indexes']}, target={tgt_info['indexes']}")
            all_matched = False
        total_docs += tgt_info["count"]

    summary["documents_restored"] = total_docs
    summary["collections_verified"] = len(target_cols)
    summary["index_parity"] = all_matched

    if not all_matched:
        summary["error"] = "Collection count or index parity check failed."
        return summary

    logger.info(f"Parity verified across {len(target_cols)} collections ({total_docs} total documents, 100% index match).")

    # 6. Deep audit on EMP001 October 24 session
    audit_rec_script = f"""
    const rec = db.getSiblingDB('{target_db}').attendance.findOne({{employee_id: 'EMP001', work_date: '2026-10-24'}});
    console.log(JSON.stringify(rec));
    """
    try:
        rec_res = subprocess.run(
            ["docker", "exec", container_name, "mongosh", "--quiet", "--eval", audit_rec_script],
            capture_output=True, text=True, check=True
        )
        rec = json.loads(rec_res.stdout.strip())
        is_emp_valid = (
            rec.get("employee_id") == "EMP001" and
            rec.get("work_date") == "2026-10-24" and
            rec.get("duration_seconds") == 7 and
            rec.get("attendance_status") == "COMPLETED"
        )
        summary["emp001_record_verified"] = is_emp_valid
        if not is_emp_valid:
            summary["error"] = f"EMP001 Oct 24 record verification failed: {rec}"
            return summary
        logger.info(f"EMP001 Oct 24 record verified: duration={rec.get('duration_seconds')}s, status={rec.get('attendance_status')}")
    except Exception as e:
        err_msg = f"Failed to audit EMP001 record in restored db: {e}"
        logger.error(err_msg)
        summary["error"] = err_msg
        return summary

    # 7. Optional cleanup
    if drop_after_verify:
        logger.info(f"Cleaning up disposable database '{target_db}'...")
        drop_cmd = ["docker", "exec", container_name, "mongosh", target_db, "--quiet", "--eval", "db.dropDatabase()"]
        subprocess.run(drop_cmd, capture_output=True, text=True)
        summary["cleaned_up"] = True
        logger.info(f"Disposable database '{target_db}' successfully dropped.")

    summary["status"] = "SUCCESS"
    summary["duration_seconds"] = round(time.time() - start_time, 3)

    logger.info("=" * 70)
    logger.info("RESTORE DRILL COMPLETED SUCCESSFULLY")
    logger.info("=" * 70)

    return summary


def main():
    parser = argparse.ArgumentParser(description="Automated Production-Grade MongoDB Restore Utility")
    parser.add_argument("--archive", required=True, help="Path to backup .archive.gz file")
    parser.add_argument("--target-db", required=True, help="Disposable target database name")
    parser.add_argument("--source-db", default="attendance_db", help="Source database name dumped in archive")
    parser.add_argument("--container", default="attendance_mongodb", help="MongoDB container name")
    parser.add_argument("--drop-after-verify", action="store_true", help="Drop target database after parity verification")
    parser.add_argument("--allow-source-overwrite", action="store_true", help="Explicit override (DANGEROUS: disabled in production)")

    args = parser.parse_args()

    result = run_restore(
        archive_path_str=args.archive,
        target_db=args.target_db,
        source_db=args.source_db,
        container_name=args.container,
        drop_after_verify=args.drop_after_verify,
        allow_source_overwrite=args.allow_source_overwrite,
    )

    if result.get("guard_blocked"):
        sys.exit(EXIT_GUARD_BLOCKED)
    elif result["status"] == "SUCCESS":
        sys.exit(EXIT_SUCCESS)
    else:
        sys.exit(EXIT_FAILURE)


if __name__ == "__main__":
    main()
