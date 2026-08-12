# ZHIROX POS Authoritative Server — v19

This service is the production authority for identity and receipt sequencing. It intentionally does **not** trust browser-local roles, passwords, or receipt counters.

## Security properties

- PostgreSQL-backed owner/user identity.
- Passwords use Node `scrypt` with a random salt; plaintext passwords are never stored.
- First bootstrap requires a deployment-only `BOOTSTRAP_TOKEN` and is disabled after the first user exists.
- Opaque sessions are stored only as SHA-256 token hashes; browser receives an HttpOnly SameSite=Strict cookie.
- Persistent database login throttling blocks repeated credential failures.
- Receipt sequence increments inside a PostgreSQL transaction.
- `Idempotency-Key` makes retries return the same reserved receipt instead of consuming/duplicating another receipt.
- Production POST requests can enforce the configured `APP_ORIGIN`.

## Remaining before multi-device financial writes

Receipt reservation is only the first authoritative write. Sales, payments, stock changes and journal entries still need a server transaction endpoint before multiple cashiers may write concurrently. Until that endpoint is wired, use the server for identity/receipt staging only and keep financial multi-writer mode disabled.
