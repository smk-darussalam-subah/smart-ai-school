# Both stages are immutable and platform-specific.  The resulting image is
# published separately and must be supplied to Compose by digest; this recipe
# deliberately has no startup package install or mutable download.
FROM python:3.12.14-alpine3.24@sha256:78e98729f8fc4099e53cffb3fe59fd15b18dfa4ace8c914dee0cefa5320068eb AS python-runtime
FROM postgres:16.15-alpine3.24@sha256:075f7ba66bc9b3ce7d6b8b635208ff61cd7cf1a67d71ec530eec5d7ae0cbe571 AS pg-backup

LABEL org.opencontainers.image.title="DIIS pg-backup" \
      org.opencontainers.image.description="Digest-bound PostgreSQL backup runtime with strict evidence validation" \
      org.opencontainers.image.base.postgres="postgres:16.15-alpine3.24@sha256:075f7ba66bc9b3ce7d6b8b635208ff61cd7cf1a67d71ec530eec5d7ae0cbe571" \
      org.opencontainers.image.base.python="python:3.12.14-alpine3.24@sha256:78e98729f8fc4099e53cffb3fe59fd15b18dfa4ace8c914dee0cefa5320068eb"

# Preserve the complete pinned PostgreSQL client runtime and add only the
# interpreter/runtime files from the separately pinned Python stage.  The two
# bases share Alpine 3.24/musl; executable assertions below prove the merged
# runtime instead of assuming that locating a binary is sufficient.
COPY --from=python-runtime /usr/local/bin/python /usr/local/bin/python
COPY --from=python-runtime /usr/local/bin/python3 /usr/local/bin/python3
COPY --from=python-runtime /usr/local/bin/python3.12 /usr/local/bin/python3.12
COPY --from=python-runtime /usr/local/lib/libpython3.12.so /usr/local/lib/libpython3.12.so
COPY --from=python-runtime /usr/local/lib/libpython3.12.so.1.0 /usr/local/lib/libpython3.12.so.1.0
COPY --from=python-runtime /usr/local/lib/python3.12 /usr/local/lib/python3.12

# Exact signed Alpine artifacts preserve ABI and package inventory visibility.
# libffi is already supplied by the PostgreSQL base; do not shadow its files.
# ADD verifies bytes and apk independently verifies the official signatures.
ADD --checksum=sha256:161223a16f042b8e469e9441291e071464fd91d4f4bbe6f496ee8d0abd4e0701 https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/libcrypto3-3.5.8-r0.apk /tmp/libcrypto3.apk
ADD --checksum=sha256:aca521e5ae4a321322a9d47ed64a1775f5ab1ffd215d1e9fc0433c58f7bfd037 https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/libssl3-3.5.8-r0.apk /tmp/libssl3.apk
ADD --checksum=sha256:8306e5bb577696c9069fe1dfd9e1dcc39d2d481c6a1b0e707fd03c3e21aa6aa2 https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/libuuid-2.42.3-r1.apk /tmp/libuuid.apk
ADD --checksum=sha256:2737e2b23ed08d4911ee62cd0163b5f4bf0379cacf4dc35b23a00209584c98fd https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/libbz2-1.0.8-r6.apk /tmp/libbz2.apk
ADD --checksum=sha256:a8a216e53d22faa3f04d2e3650c1991af66f8d0b42fadff5afcdb9afb60b19e5 https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/sqlite-libs-3.53.4-r0.apk /tmp/sqlite-libs.apk
RUN apk add --no-cache --no-network /tmp/libcrypto3.apk /tmp/libssl3.apk \
      /tmp/libuuid.apk /tmp/libbz2.apk /tmp/sqlite-libs.apk \
    && rm /tmp/libcrypto3.apk /tmp/libssl3.apk /tmp/libuuid.apk /tmp/libbz2.apk /tmp/sqlite-libs.apk

# This runtime never installs Python packages. Exclude the bundled installer
# and its vendored packages without removing any standard-library modules.
RUN rm -rf /usr/local/lib/python3.12/site-packages/pip \
           /usr/local/lib/python3.12/site-packages/pip-25.0.1.dist-info \
           /usr/local/lib/python3.12/ensurepip

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
    python3 -c 'import importlib.util; assert importlib.util.find_spec("pip") is None; assert importlib.util.find_spec("ensurepip") is None'; \
    python3 -c 'import sys, ssl, hashlib, zlib, bz2, lzma, sqlite3, ctypes, json, zipfile; assert sys.version_info[:2] == (3, 12); assert ssl.OPENSSL_VERSION; json.loads("{\"ok\":true}"); assert hasattr(zipfile, "ZipFile")'; \
    test "$(cut -d. -f1,2 /etc/alpine-release)" = 3.24; \
    pg_dump --version | grep -Eq 'PostgreSQL\) 16\.'
