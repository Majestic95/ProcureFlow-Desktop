# Split-Screen / Dual Window Design Options

**Date:** April 1, 2026
**Status:** Catalogued — deferred until pin system proves useful

---

## Option A — iframe-based split (Recommended if we build it)
- Split main content 50/50, right pane is iframe to same app
- Medium difficulty (~200 lines), zero routing refactor
- Doubles Firestore listeners, same-domain auth works

## Option B — React portal split (Most native)
- Custom router wrapper managing two URL states per pane
- High difficulty (2-3 weeks), most seamless feel
- Significant refactoring required

## Option C — Browser-native tiling
- Users open two tabs + OS-level split (Windows Snap, macOS Split View)
- Zero cost, fully independent, no in-app awareness

## Decision
Build Option A after the pin/bookmark system ships and proves users want simultaneous views.
