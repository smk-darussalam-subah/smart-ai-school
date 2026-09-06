# Both stages are immutable and platform-specific.  The resulting image is
# published separately and must be supplied to Compose by digest; this recipe
# deliberately has no startup package install or mutable download.
FROM python:3.12-alpine3.20@sha256:edf7256d5773b7ca9c41290b7bf6f844c15c6c2168f97473c276acb6789f12ab AS python-runtime
FROM postgres:16.4-alpine3.20@sha256:5660c2cbfea50c7a9127d17dc4e48543eedd3d7a41a595a2dfa572471e37e64c AS pg-backup

LABEL org.opencontainers.image.title="DIIS pg-backup" \
      org.opencontainers.image.description="Digest-bound PostgreSQL backup runtime with strict evidence validation" \
      org.opencontainers.image.base.postgres="postgres:16.4-alpine3.20@sha256:5660c2cbfea50c7a9127d17dc4e48543eedd3d7a41a595a2dfa572471e37e64c" \
      org.opencontainers.image.base.python="python:3.12-alpine3.20@sha256:edf7256d5773b7ca9c41290b7bf6f844c15c6c2168f97473c276acb6789f12ab"

# Preserve the complete pinned PostgreSQL client runtime and add only the
# interpreter/runtime files from the separately pinned Python stage.  The two
# bases share Alpine 3.20/musl; executable assertions below prove the merged
# runtime instead of assuming that locating a binary is sufficient.
COPY --from=python-runtime /usr/local/bin/python /usr/local/bin/python
COPY --from=python-runtime /usr/local/bin/python3 /usr/local/bin/python3
COPY --from=python-runtime /usr/local/bin/python3.12 /usr/local/bin/python3.12
COPY --from=python-runtime /usr/local/lib/libpython3.12.so /usr/local/lib/libpython3.12.so
COPY --from=python-runtime /usr/local/lib/libpython3.12.so.1.0 /usr/local/lib/libpython3.12.so.1.0
COPY --from=python-runtime /usr/local/lib/python3.12 /usr/local/lib/python3.12

COPY scripts/w10d_completion_validation.py /scripts/w10d_completion_validation.py
COPY scripts/bounded-command-capture.py /scripts/bounded-command-capture.py
COPY scripts/parse-minio-du-observation.py /scripts/parse-minio-du-observation.py

# Build-time integration assertion: the exact image that can be published for
# pg-backup must execute the validator and expose every required client.
RUN set -eux; \
    command -v python3; \
    python3 /scripts/w10d_completion_validation.py --help >/dev/null; \
    command -v pg_dump; \
    pg_dump --version >/dev/null; \
    command -v pg_restore; \
    pg_restore --version >/dev/null; \
    command -v psql; \
    psql --version >/dev/null; \
    command -v pg_isready; \
    pg_isready --version >/dev/null; \
    command -v crond; \
    command -v wget; \
    python3 -c 'import json, zipfile; json.loads("{\"ok\":true}"); assert hasattr(zipfile, "ZipFile")'
