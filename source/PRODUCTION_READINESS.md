# ZHIROX v19 Production Readiness

## Completed in this hardening pass

- Production database/state starts empty; no seeded products, customers, balances or categories.
- Removed shared demo users and the global demo password.
- First-run owner bootstrap replaces demo credentials.
- Passwords are stored only as PBKDF2-SHA256 derived hashes with per-user random salt (210,000 iterations).
- Authentication fails closed if secure Web Crypto is unavailable.
- Authenticated session is not persisted across browser reloads; credentials remain protected by a derived hash.
- Added CI production gate that rejects reintroduction of critical demo credentials/data.

## Security boundary

This pass hardens **single-device/offline bootstrap authentication**. It is not yet the final multi-device server identity system. Before public multi-device rollout, move credential verification and authorization to the production backend and keep the device-local mode only as an explicitly controlled offline fallback.

## Next production gates

1. Server-side identity, roles and permission revocation.
2. Central monotonic/unique receipt sequencing with idempotency keys.
3. Conflict-safe multi-device sync and server validation of queued financial writes.
4. Automatic encrypted daily backup with restore drill.
5. Printer/scale hardware acceptance tests.
6. Load test with the real ~20,000-product catalog.
