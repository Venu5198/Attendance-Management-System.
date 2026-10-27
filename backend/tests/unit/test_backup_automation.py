"""
Unit Tests for MongoDB Backup and Restore Automation
Phase 5: Production Operations Readiness

Tests:
1. Credential and secret masking
2. Process locking and concurrency collision
3. Archive integrity verification (valid vs empty vs corrupted gzip)
4. Retention policy calculation and pruning
5. Restore safety guard (blocking restore into source database)
"""

import gzip
import json
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Ensure scripts directory is in sys.path
for candidate in [
    Path(__file__).resolve().parent.parent.parent.parent / "scripts",
    Path("/scripts"),
    Path("/app/../scripts"),
]:
    if candidate.exists():
        sys.path.insert(0, str(candidate))
        break

try:
    import backup_mongodb
    import restore_mongodb
except ModuleNotFoundError:
    backup_mongodb = None
    restore_mongodb = None

pytestmark = pytest.mark.skipif(
    backup_mongodb is None or restore_mongodb is None,
    reason="Backup/restore automation scripts not available in container environment"
)


@pytest.fixture(autouse=True)
def clean_collections():
    """Override autouse database fixture from conftest to keep unit tests fast and isolated."""
    yield


class TestCredentialMasking:
    def test_mask_credentials_mongodb_uri(self):
        uri = "mongodb://superadmin:P@ssw0rd123!@cluster0.mongodb.net:27017/attendance_db?authSource=admin"
        masked = backup_mongodb.mask_credentials(uri)
        assert "superadmin" in masked
        assert "P@ssw0rd123!" not in masked
        assert "mongodb://superadmin:***@cluster0.mongodb.net" in masked

    def test_mask_credentials_rabbitmq_uri(self):
        uri = "amqp://production_user:SecretRabbitPass99@rabbitmq:5672//"
        masked = backup_mongodb.mask_credentials(uri)
        assert "production_user" in masked
        assert "SecretRabbitPass99" not in masked
        assert "amqp://production_user:***@rabbitmq" in masked

    def test_mask_credentials_plain_text_untouched(self):
        plain = "mongodb dump completed with 148 documents"
        assert backup_mongodb.mask_credentials(plain) == plain

    def test_mask_credentials_empty_string(self):
        assert backup_mongodb.mask_credentials("") == ""


class TestProcessLock:
    def test_acquire_and_release_lock(self, tmp_path):
        lock_file = tmp_path / "test.lock"
        lock = backup_mongodb.ProcessLock(lock_file)

        assert lock.acquire() is True
        assert lock_file.exists()

        content = json.loads(lock_file.read_text())
        assert content["pid"] == os.getpid()

        lock.release()
        assert not lock_file.exists()

    def test_lock_collision_with_running_pid(self, tmp_path):
        lock_file = tmp_path / "test.lock"
        # Simulate active lock with current PID
        lock_file.write_text(json.dumps({"pid": os.getpid(), "created_at": "2026-10-27T08:00:00Z"}))

        second_lock = backup_mongodb.ProcessLock(lock_file)
        assert second_lock.acquire() is False

    def test_stale_lock_overwritten_for_dead_pid(self, tmp_path):
        lock_file = tmp_path / "test.lock"
        # 999999 is typically a dead PID
        lock_file.write_text(json.dumps({"pid": 999999, "created_at": "2026-10-20T08:00:00Z"}))

        with patch.object(backup_mongodb.ProcessLock, "_is_pid_running", return_value=False):
            lock = backup_mongodb.ProcessLock(lock_file)
            assert lock.acquire() is True
            content = json.loads(lock_file.read_text())
            assert content["pid"] == os.getpid()
            lock.release()


class TestArchiveIntegrityVerification:
    def test_verify_valid_gzip_archive(self, tmp_path):
        archive = tmp_path / "valid.archive.gz"
        with gzip.open(archive, "wb") as gz:
            gz.write(b"SAMPLE MONGODUMP BSON DATA STREAM" * 50)

        valid, msg = backup_mongodb.verify_archive_integrity(archive)
        assert valid is True
        assert "Integrity confirmed" in msg

    def test_verify_missing_archive(self, tmp_path):
        archive = tmp_path / "nonexistent.archive.gz"
        valid, msg = backup_mongodb.verify_archive_integrity(archive)
        assert valid is False
        assert "not found" in msg.lower() or "not created" in msg.lower()

    def test_verify_too_small_archive(self, tmp_path):
        archive = tmp_path / "tiny.archive.gz"
        archive.write_bytes(b"123")
        valid, msg = backup_mongodb.verify_archive_integrity(archive)
        assert valid is False
        assert "suspiciously small" in msg.lower()

    def test_verify_corrupted_gzip_archive(self, tmp_path):
        archive = tmp_path / "corrupt.archive.gz"
        # Write 1000 bytes of non-gzip garbage
        archive.write_bytes(b"CORRUPTED_NON_GZIP_GARBAGE" * 50)
        valid, msg = backup_mongodb.verify_archive_integrity(archive)
        assert valid is False
        assert "corruption detected" in msg.lower()


class TestRetentionPruning:
    def test_prune_expired_archives(self, tmp_path):
        # Create 1 recent file and 1 old file
        recent = tmp_path / "attendance_db_backup_20261027_000000.archive.gz"
        recent.write_bytes(b"recent")

        old = tmp_path / "attendance_db_backup_20260901_000000.archive.gz"
        old.write_bytes(b"old")
        old_meta = tmp_path / "attendance_db_backup_20260901_000000.json"
        old_meta.write_text("{}")

        # Set mtime of old file to 60 days ago
        old_time = os.path.getmtime(old) - (60 * 86400)
        os.utime(old, (old_time, old_time))
        os.utime(old_meta, (old_time, old_time))

        pruned = backup_mongodb.prune_expired_archives(tmp_path, retention_days=30)
        assert old.name in pruned
        assert not old.exists()
        assert not old_meta.exists()
        assert recent.exists()


class TestRestoreSafeguards:
    def test_restore_guard_blocks_source_database(self, tmp_path):
        archive = tmp_path / "test.archive.gz"
        with gzip.open(archive, "wb") as gz:
            gz.write(b"SAMPLE" * 100)

        result = restore_mongodb.run_restore(
            archive_path_str=str(archive),
            target_db="attendance_db",
            source_db="attendance_db",
            allow_source_overwrite=False,
        )

        assert result.get("guard_blocked") is True
        assert result["status"] == "FAILED"
        assert "SAFETY GUARD TRIGGERED" in result["error"]

    def test_restore_guard_blocks_case_insensitive_source_database(self, tmp_path):
        archive = tmp_path / "test.archive.gz"
        with gzip.open(archive, "wb") as gz:
            gz.write(b"SAMPLE" * 100)

        result = restore_mongodb.run_restore(
            archive_path_str=str(archive),
            target_db="ATTENDANCE_DB",
            source_db="attendance_db",
            allow_source_overwrite=False,
        )

        assert result.get("guard_blocked") is True
        assert result["status"] == "FAILED"

    def test_restore_rejects_missing_archive(self):
        result = restore_mongodb.run_restore(
            archive_path_str="/tmp/definitely_missing_archive_file.archive.gz",
            target_db="attendance_db_disposable_test",
            source_db="attendance_db",
        )
        assert result["status"] == "FAILED"
        assert "not found" in result["error"].lower()
