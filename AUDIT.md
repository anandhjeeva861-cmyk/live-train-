# v1 Audit — Issues Found and Fixes Applied

## High-priority fixes

1. **Misleading train search fallback**
   - v1 returned unrelated trains when an exact From/To route had no result.
   - v2 returns an honest empty result and suggests changing filters.

2. **Live map layers accumulated**
   - v1 removed only the polyline; station markers from previously selected trains remained on the map.
   - v2 uses dedicated `LayerGroup`s and clears route/POI layers cleanly.

3. **Weather API called every 3 seconds**
   - v1 called weather from every live polling update, creating unnecessary provider traffic and rate-limit risk.
   - v2 caches weather on the server for 10 minutes and refreshes client weather at most once per minute.

4. **Tracking used equal segment timing**
   - v1 gave every route segment equal progress time even if segment distances differed.
   - v2 calculates Haversine segment distance and interpolates by total route distance.

5. **Tracking reset behavior was too aggressive**
   - v1 looped the full journey every 12 minutes.
   - v2 uses a longer per-train simulation cycle and consistent train-specific offset. Real production data still requires an authorized provider.

6. **No true realtime transport**
   - v1 polled `/live` every 3 seconds.
   - v2 adds Server-Sent Events with automatic browser reconnection and a polling fallback.

## Booking / API fixes

7. **Booking endpoint accepted arbitrary payloads**
   - v1 trusted client body and could generate a booking from invalid train/class/passenger data.
   - v2 validates train, class, passenger count, seat and journey date.

8. **Bookings disappeared after refresh**
   - v1 kept the booking only in browser memory.
   - v2 persists demo bookings in `data/bookings.json` and exposes history + PNR lookup endpoints.

9. **Potential unsafe HTML flow**
   - v1 relied heavily on `innerHTML` with values that could eventually come from user/provider data.
   - v2 escapes interpolated values and validates server inputs. A production app should still use a component framework/template escaping strategy consistently.

10. **Date calculation used UTC conversion**
    - v1 used `toISOString().split('T')[0]`, which can produce the wrong local date near timezone boundaries.
    - v2 formats the local date directly and also sets the minimum journey date.

## UX / product improvements

11. Added PNR/train-number quick tracking.
12. Added current section, distance left, approximate arrival clock and station timeline.
13. Added tracking connection status and train-bearing marker rotation.
14. Added tourism spots on the live map, not only image cards.
15. Added responsive layout closer to the supplied desktop/mobile reference.
16. Added explicit demo/production boundaries for payments and railway APIs.

## Remaining production work

- Real railway data provider and legal/API authorization
- Real seat inventory and ticket issuance
- User accounts, roles and secure authentication
- Database + migrations + transactions
- Payment gateway + webhook verification
- Cancellations/refunds
- Push/email/SMS alerts
- Admin panel and operational monitoring
- Unit/integration/E2E tests
