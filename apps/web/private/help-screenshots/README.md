# Private Help Screenshots

Checkpoint B writes only approved, PII-safe screenshots into this directory.
Files are streamed through the authenticated Help screenshot route and must never
be copied into `public/`.

Every ready entry in `HELP_SCREENSHOTS` must record the exact file name, SHA-256,
byte size, dimensions, frozen application SHA, and capture timestamp. The route
rejects missing, corrupt, oversized, symlinked, or unauthorized media.
