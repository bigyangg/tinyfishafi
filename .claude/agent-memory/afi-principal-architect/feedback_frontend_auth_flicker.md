---
name: Auth loading flicker prevention pattern
description: How to prevent blank screen flicker on auth state initialization in React + Supabase
type: feedback
---

Never render `null` or `{!loading && children}` at the AuthProvider level. This causes a blank screen flash on every page load and navigation.

**Why:** `supabase.auth.getSession()` is async and takes 200-500ms on cold load. During that window, `loading=true` and the old pattern showed nothing — resulting in a flash of white/black before content appeared.

**How to apply:**
- The correct pattern is: render a stable, on-brand loading state during auth initialization. For AFI, this is the `#050505` background with AFI logo + animated blue scan-line.
- Route guards (`ProtectedRoute`, `PublicOnlyRoute`) should also check `loading` and return `null` rather than triggering navigation during init.
- The loading state is rendered at the `AuthProvider` level, so it blocks ALL children including the router — this is intentional and prevents any route-level flicker.
- Keep the loading state minimal and fast (no heavy animations) — it should resolve in <1s on typical connections.
