---
name: Map Weather Integration
overview: Implement Google Maps + Google Weather forecast in the map tab with Philippines-appropriate defaults and risk signaling, reusing existing services and env configuration.
todos:
  - id: map-weather-ui
    content: Integrate useWeatherSignal into map tab and add current+hourly forecast panel with risk signal
    status: completed
  - id: weather-risk-tuning
    content: Refine weather-signal derivation for sustained heavy rain/thunderstorm windows
    status: completed
  - id: weather-service-hardening
    content: Add non-breaking API key/response guardrails in weather service
    status: completed
  - id: verify-lint-and-flows
    content: Run lint and validate online/offline/location-denied/error scenarios
    status: completed
isProject: false
---

# Google Maps + PH Weather Plan

## Goal

Upgrade the map tab to show actionable weather forecasting for users in the Philippines, using your existing Google API key and weather/map service layer.

## Implementation Scope

- Enhance `[/home/kyae-dev/Repos/devcamp-manila/app/(tabs)/map.tsx](/home/kyae-dev/Repos/devcamp-manila/app/(tabs)`/map.tsx) to display:
  - current weather snapshot (condition, temperature, rain probability)
  - next-hours forecast list (time + rain intensity/probability)
  - derived flood risk signal (`MONITOR` / `PREPARE` / `LEAVE` / `EVACUATE`) clearly surfaced on-map and in panel
- Reuse existing weather polling/cache logic from `[/home/kyae-dev/Repos/devcamp-manila/src/features/alerts/use-weather-signal.ts](/home/kyae-dev/Repos/devcamp-manila/src/features/alerts/use-weather-signal.ts)` by wiring it into the map tab with user location.
- Keep fallback behavior Philippines-first (Marikina default coords already in location/weather flows), so forecast remains meaningful when location permission/network is limited.

## Service and Forecast Accuracy Updates

- Improve forecast derivation in `[/home/kyae-dev/Repos/devcamp-manila/src/services/weather-signal.ts](/home/kyae-dev/Repos/devcamp-manila/src/services/weather-signal.ts)`:
  - evaluate short-term trend windows (e.g., next 3/6 hours) instead of only single-point checks
  - use heavier weighting for sustained rainfall + thunderstorm probability (more aligned with PH flood risk patterns)
  - keep thresholds explicit and centralized for easy tuning
- Add light guardrails in `[/home/kyae-dev/Repos/devcamp-manila/src/services/weather.ts](/home/kyae-dev/Repos/devcamp-manila/src/services/weather.ts)`:
  - defensive handling for missing API key/empty responses
  - graceful fallback to cached/weather-neutral state without breaking map UI

## UX and Reliability

- In map UI, show forecast freshness (`fetchedAt`) and offline/cached state to avoid false confidence.
- Ensure no regressions to existing map features (flood/drain reports, center markers, offline queue sync).
- Keep the UI concise and mobile-friendly (single weather card + compact hourly rows) to avoid map clutter.

## Validation

- Run lint checks for edited files.
- Verify behavior paths:
  - online with location granted
  - online with location denied (default PH location)
  - offline with cached weather
  - API error path (map still usable, weather degrades safely)

## Notes

- Existing env key setup already matches implementation (`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is used by both maps and weather services), so no env schema changes are needed.
