# Preservation First

Before any implementation Work Package:

1. Read `CURRENT_SYSTEM_PRESERVATION_GATE.md`.
2. Identify whether Market, PiXiSYNC, existing URLs, projects, sales, purchases, licenses,
   royalties, payouts, or entitlements can be affected.
3. Add a compatibility section to the Work Package plan.
4. Keep the current production path active.
5. Use local/isolated fixtures and default-off feature flags.
6. Do not apply production migrations or cut over production.
7. Record rollback and reconciliation requirements.

The current Market and PiXiSYNC are production dependencies, not disposable legacy code.
