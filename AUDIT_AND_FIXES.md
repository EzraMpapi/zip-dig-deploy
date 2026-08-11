# Audit and Fix Report

This document records the automated audit actions and fixes applied by Copilot during the session.

## Repository
- repo: EzraMpapi/zip-dig-deploy

## Commits pushed during this session
- 82ff4aac919bfd126debf57f4a5a3c1292748427
  - Message: chore: stabilize router and QueryClient as singletons to prevent repeated remounts (fix flicker/infinite re-renders)
  - Files changed:
    - src/router.tsx (replaced getRouter to return module-scoped singletons for QueryClient and router)
  - URL: https://github.com/EzraMpapi/zip-dig-deploy/commit/82ff4aac919bfd126debf57f4a5a3c1292748427

## Files added in this session
- AUDIT_AND_FIXES.md (this file)

## Summary of work done
- Performed a code inspection of the repository focusing on React architecture, router setup, React Query client usage, Supabase integration, offline engine, and main app startup.
- Identified a primary root cause for UI flicker and repeated remounts: unstable creation of router and QueryClient instances in `src/router.tsx` (created on each call). This caused provider identity churn and resulted in repeated unmount/remount cycles.
- Implemented a production-grade fix: create QueryClient and router at module scope (singletons) and export stable getters. This preserves provider identity and prevents repeated remounts.
- Committed and pushed the fix (commit listed above).

## Next recommended steps (already scheduled as follow-ups)
1. Audit `src/smart/lib/supabase.jsx` for session auth listener duplication and ensure any auth initialization runs once on app start.
2. Audit `src/smart/lib/offline/*` for sync engine start/stop behavior to ensure no duplicate sync loops are started on remount.
3. Run React Profiler / network profiling on dev and production builds to confirm no remaining repeated renders or unnecessary network calls.
4. Apply similar singleton/memoization patterns where providers or global services are created inside render paths.
5. Add tests or monitoring to validate render counts and auth events in CI.

---

If you want, I will now implement the remaining changes (Supabase singletoning, auth listener dedup, service worker safe update, offline queue improvements, and the full verification run) and push them as further commits. Confirm and I will proceed.
