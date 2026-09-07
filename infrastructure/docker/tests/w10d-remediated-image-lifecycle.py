#!/usr/bin/env python3
"""Actual local signal/cleanup checks for the synthetic image integration harness."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def resources(kind):
    args = ["docker", kind, "ls"] + (["--all"] if kind == "container" else [])
    result = subprocess.run(args + ["--filter", "label=com.diis.local-remediation",
                                  "--format", "{{.ID}}"], capture_output=True, check=True, timeout=30)
    return set(result.stdout.decode().splitlines())


parser = argparse.ArgumentParser()
parser.add_argument("--image", required=True)
args = parser.parse_args()
harness = str(Path(__file__).with_name("w10d-remediated-image-integration.py"))
baseline = {kind: resources(kind) for kind in ("container", "network")}
if any(baseline.values()):
    raise RuntimeError("another synthetic image test is active; do not interfere")
passed = []
for number in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
    process = subprocess.Popen([sys.executable, harness, "--image", args.image],
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        deadline = time.monotonic() + 60
        while not resources("container"):
            if process.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError("child failed to reach owned create boundary")
            time.sleep(0.05)
        os.kill(process.pid, number)
        stdout, stderr = process.communicate(timeout=180)
        if process.returncode != 128 + number or stdout:
            raise RuntimeError("signal was lost or false success was emitted")
        for kind in baseline:
            if resources(kind) != baseline[kind]:
                raise RuntimeError("signal cleanup left owned resources")
        passed.append(signal.Signals(number).name)
    finally:
        if process.poll() is None:
            process.send_signal(signal.SIGTERM)
            process.communicate(timeout=180)
rejected = subprocess.run([sys.executable, harness, "--image", "mutable:latest"],
                          capture_output=True, timeout=30)
if rejected.returncode == 0 or rejected.stdout:
    raise RuntimeError("mutable image input was accepted")
for kind in baseline:
    if resources(kind) != baseline[kind]:
        raise RuntimeError("invalid input reached resource mutation")
print(json.dumps({"signals": passed, "invalidImage": "rejected-before-mutation",
                  "cleanup": "owned containers/network absent", "checks": "4/4"}))
