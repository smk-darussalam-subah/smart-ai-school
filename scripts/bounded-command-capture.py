#!/usr/bin/env python3
"""Capture a command's stdout to an exclusive bounded file, preserving producer status."""

from __future__ import annotations

import argparse
import os
import selectors
import signal
import stat
import subprocess
import sys
import time
from pathlib import Path


def reject(message: str, code: int = 65) -> int:
    print(f"BOUNDED_CAPTURE_REJECTED reason={message}", file=sys.stderr)
    return code


def process_group_exists(pgid: int) -> bool:
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def terminate_process_group(process: subprocess.Popen[bytes]) -> bool:
    """Terminate every member of the producer session and prove the group is gone."""
    for sig, grace in ((signal.SIGTERM, 2.0), (signal.SIGKILL, 2.0)):
        try:
            os.killpg(process.pid, sig)
        except ProcessLookupError:
            pass
        deadline = time.monotonic() + grace
        while process_group_exists(process.pid) and time.monotonic() < deadline:
            time.sleep(0.02)
        if not process_group_exists(process.pid):
            break
    try:
        process.wait(timeout=1)
    except subprocess.TimeoutExpired:
        return False
    return not process_group_exists(process.pid)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-bytes", type=int, required=True)
    parser.add_argument("--timeout-seconds", type=int, required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.command[:1] == ["--"]:
        args.command = args.command[1:]
    if not args.command or not 1 <= args.max_bytes <= 16 * 1024 * 1024 or not 1 <= args.timeout_seconds <= 60:
        return reject("invalid-arguments")
    try:
        parent = args.output.parent.resolve(strict=True)
        parent_stat = os.stat(parent, follow_symlinks=False)
        if not stat.S_ISDIR(parent_stat.st_mode) or stat.S_IMODE(parent_stat.st_mode) != 0o700:
            return reject("output-parent-not-private")
        if parent_stat.st_uid != os.geteuid() or args.output.parent.is_symlink():
            return reject("output-parent-owner-or-link")
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except OSError:
        return reject("output-create-failed")

    process: subprocess.Popen[bytes] | None = None
    failure = ""
    try:
        process = subprocess.Popen(
            args.command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            start_new_session=True, close_fds=True,
        )
        assert process.stdout is not None
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        deadline = time.monotonic() + args.timeout_seconds
        count = 0
        eof = False
        with os.fdopen(fd, "wb", buffering=0) as output:
            fd = -1
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    failure = "process-group-ambiguous" if process.poll() is not None else "timeout"
                    break
                events = [] if eof else selector.select(min(remaining, 0.1))
                for key, _ in events:
                    chunk = os.read(key.fd, 65536)
                    if not chunk:
                        selector.unregister(process.stdout)
                        eof = True
                        continue
                    count += len(chunk)
                    if count > args.max_bytes:
                        failure = "byte-limit"
                        break
                    output.write(chunk)
                if failure:
                    break
                rc = process.poll()
                if rc is not None and rc != 0:
                    failure = "producer-nonzero"
                    break
                if eof and rc == 0 and not process_group_exists(process.pid):
                    break
                if eof:
                    time.sleep(min(remaining, 0.02))
        selector.close()
        if failure and not terminate_process_group(process):
            failure = "process-group-cleanup-ambiguous"
    except (OSError, subprocess.SubprocessError):
        failure = "capture-failed"
    finally:
        if fd >= 0:
            os.close(fd)
    if failure:
        if process is not None and process_group_exists(process.pid):
            if not terminate_process_group(process):
                failure = "process-group-cleanup-ambiguous"
        try:
            args.output.unlink()
        except FileNotFoundError:
            pass
        except OSError:
            return reject("cleanup-failed", 74)
        return reject(failure)
    return 0


if __name__ == "__main__":
    sys.exit(main())
