#!/usr/bin/env python3
"""Local-only, real PostgreSQL/MinIO smoke and recovery; no provider credentials."""

import argparse
import hashlib
import json
import os
import re
import signal
import subprocess
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MINIO = "minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e"
MC = "minio/mc@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727"
PENDING_SIGNAL = 0
CLEANING = False


def remember_signal(number, _frame):
    # Do not interrupt Popen registration or abandon a live Docker client.
    # The active command is bounded; cleanup runs before signal exit is emitted.
    global PENDING_SIGNAL
    PENDING_SIGNAL = PENDING_SIGNAL or number


def command(*args, data=None, timeout=60):
    if PENDING_SIGNAL and not CLEANING:
        raise SystemExit(128 + PENDING_SIGNAL)
    result = subprocess.run(args, input=data, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout, check=False)
    if PENDING_SIGNAL and not CLEANING:
        raise SystemExit(128 + PENDING_SIGNAL)
    if result.returncode:
        # The fixtures have synthetic credentials, but do not echo command/env.
        raise RuntimeError(f"command failed: {args[0]} exit={result.returncode}")
    return result.stdout


def main():
    global CLEANING
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    args = parser.parse_args()
    if any(os.environ.get(key) for key in ("DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH")):
        raise ValueError("environment Docker endpoint overrides are forbidden")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", args.image):
        raise ValueError("exact local image ID required")
    info = json.loads(command("docker", "info", "--format", "{{json .}}"))
    if info.get("OperatingSystem") != "Docker Desktop" or info.get("OSType") != "linux":
        raise ValueError("only local Linux Docker Desktop is authorized")
    context = json.loads(command("docker", "context", "inspect"))[0]
    endpoint = context["Endpoints"]["docker"]["Host"]
    if endpoint not in {"unix:///var/run/docker.sock", "npipe:////./pipe/dockerDesktopLinuxEngine"}:
        raise ValueError("remote Docker endpoint rejected")
    for image in (args.image, MINIO, MC):
        metadata = json.loads(command("docker", "image", "inspect", image))[0]
        if metadata["Os"] != "linux" or metadata["Architecture"] != "amd64":
            raise ValueError("local image platform mismatch")
    prefix = "diis-w10d-remediation-" + uuid.uuid4().hex[:12]
    label = "com.diis.local-remediation=" + prefix
    network, pg, objects = prefix + "-net", prefix + "-pg", prefix + "-objects"
    owned = [pg, objects]
    failures = []
    result = None

    def absent(kind, name):
        raw = command("docker", kind, "ls", *( ["--all"] if kind == "container" else []),
                      "--filter", "name=" + name, "--format", "{{.Names}}" if kind == "container" else "{{.Name}}")
        return name not in raw.decode().splitlines()

    for kind, name in (("network", network), ("container", pg), ("container", objects)):
        if not absent(kind, name):
            raise ValueError("resource name already exists")

    def pgsql(sql, database="postgres"):
        return command("docker", "exec", "-i", pg, "psql", "-U", "postgres", "-d", database,
                       "-At", "-v", "ON_ERROR_STOP=1", data=sql.encode())

    def mc(*arguments, data=None):
        name = prefix + "-mc-" + uuid.uuid4().hex[:8]
        owned.append(name)  # Ownership intent precedes create/timeout boundaries.
        return command("docker", "run", "--rm", "-i", "--name", name, "--label", label,
                       "--network", network, "-e",
                       "MC_HOST_fixture=http://synthetic:synthetic-local-only@objects:9000",
                       MC, *arguments, data=data)

    try:
        command("docker", "network", "create", "--internal", "--label", label, network)
        command("docker", "run", "-d", "--name", pg, "--label", label, "--network", network,
                "--tmpfs", "/var/lib/postgresql/data:rw,size=512m", "--tmpfs", "/tmp:rw,size=64m",
                "-e", "POSTGRES_PASSWORD=synthetic-local-only", args.image)
        command("docker", "exec", pg, "sh", "-ec",
                "for i in $(seq 1 120); do pg_isready -U postgres >/dev/null && exit 0; sleep 0.25; done; exit 1")
        smoke = command("docker", "exec", pg, "python3", "-c",
                        "import ssl,bz2,lzma,sqlite3,ctypes,hashlib,zipfile,sys; "
                        "assert sys.version_info[:2]==(3,12); print(sys.version.split()[0],ssl.OPENSSL_VERSION)").decode().strip()
        for helper in ("w10d_completion_validation.py", "bounded-command-capture.py", "parse-minio-du-observation.py"):
            expected = hashlib.sha256((ROOT / "scripts" / helper).read_bytes()).hexdigest()
            actual = command("docker", "exec", pg, "sha256sum", "/scripts/" + helper).decode().split()[0]
            if actual != expected:
                raise ValueError("candidate helper bytes differ from source")
        pgsql("CREATE DATABASE fixture_source; CREATE DATABASE fixture_restore;")
        pgsql("CREATE TABLE records(id int PRIMARY KEY, body text NOT NULL); "
              "INSERT INTO records VALUES(1,'synthetic-a'),(2,'synthetic-b');", "fixture_source")
        command("docker", "exec", pg, "pg_dump", "-U", "postgres", "-d", "fixture_source",
                "--format=custom", "--no-owner", "--no-acl", "--file=/tmp/fixture.dump")
        command("docker", "exec", pg, "pg_restore", "--list", "/tmp/fixture.dump")
        command("docker", "exec", pg, "pg_restore", "-U", "postgres", "-d", "fixture_restore",
                "--exit-on-error", "--no-owner", "--no-acl", "/tmp/fixture.dump")
        if pgsql("SELECT count(*) FROM records;", "fixture_restore").strip() != b"2":
            raise ValueError("real restore count mismatch")
        dump_sha = command("docker", "exec", pg, "sha256sum", "/tmp/fixture.dump").decode().split()[0]
        pgsql("DROP DATABASE fixture_restore; DROP DATABASE fixture_source;")
        if pgsql("SELECT count(*) FROM pg_database WHERE datname LIKE 'fixture_%';").strip() != b"0":
            raise ValueError("disposable database absence not proven")
        command("docker", "exec", pg, "sh", "-ec", "rm /tmp/fixture.dump; test ! -e /tmp/fixture.dump")
        command("docker", "run", "-d", "--name", objects, "--label", label, "--network", network,
                "--network-alias", "objects", "--tmpfs", "/data:rw,size=128m",
                "-e", "MINIO_ROOT_USER=synthetic", "-e", "MINIO_ROOT_PASSWORD=synthetic-local-only",
                MINIO, "server", "/data")
        # mc ready performs real bounded health readiness; no host ports/mounts.
        mc("ready", "fixture")
        mc("mb", "fixture/sample-source")
        mc("mb", "fixture/disposable-restore")
        payload = b"DIIS synthetic sample object\n" * 128
        mc("pipe", "fixture/sample-source/sample", data=payload)
        fetched = mc("cat", "fixture/sample-source/sample")
        if fetched != payload:
            raise ValueError("source object readback mismatch")
        mc("pipe", "fixture/disposable-restore/sample", data=fetched)
        restored = mc("cat", "fixture/disposable-restore/sample")
        if hashlib.sha256(restored).digest() != hashlib.sha256(payload).digest():
            raise ValueError("sample object restore hash mismatch")
        mc("pipe", "fixture/disposable-restore/sample", data=payload[:-1] + b"!")
        if hashlib.sha256(mc("cat", "fixture/disposable-restore/sample")).digest() == hashlib.sha256(payload).digest():
            raise ValueError("object corruption negative control failed")
        result = {"image": args.image, "platform": "linux/amd64", "runtime": smoke,
                  "helperHashes": "3/3", "postgresRestore": "2/2 rows; database/dump absent",
                  "dumpSha256": dump_sha, "sampleObjectRestore": "hash verified; corruption detected",
                  "objectSha256": hashlib.sha256(payload).hexdigest(),
                  "scope": "synthetic local transport/client test, not independent-cloud provenance proof"}
    finally:
        CLEANING = True
        for name in reversed(owned):
            try:
                if not absent("container", name):
                    metadata = json.loads(command("docker", "container", "inspect", name))[0]
                    if metadata["Config"]["Labels"].get("com.diis.local-remediation") != prefix:
                        raise ValueError("cleanup ownership mismatch")
                    command("docker", "container", "rm", "-f", "-v", name)
                if not absent("container", name):
                    raise ValueError("container absence not proven")
            except Exception:
                failures.append("container-cleanup-ambiguous")
        try:
            if not absent("network", network):
                metadata = json.loads(command("docker", "network", "inspect", network))[0]
                if metadata["Labels"].get("com.diis.local-remediation") != prefix:
                    raise ValueError("network ownership mismatch")
                command("docker", "network", "rm", network)
            if not absent("network", network):
                raise ValueError("network absence not proven")
        except Exception:
            failures.append("network-cleanup-ambiguous")
        if failures:
            raise RuntimeError("CLEANUP_AMBIGUOUS retry=prohibited " + ",".join(failures))
    if PENDING_SIGNAL:
        raise SystemExit(128 + PENDING_SIGNAL)
    result["cleanup"] = "owned containers/network absent; no named volume or host mount created"
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    for number in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
        signal.signal(number, remember_signal)
    main()
