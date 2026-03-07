# AGOS — Product Context (Aligned to MVP Doc v4.x)

> This file is the working product context for implementation prompts. It has been aligned to `AGOS_documentation.pdf` (March 2026) and should be treated as the current source for MVP scope and constraints.

---

## 1. Product Definition

**AGOS** is a mobile-first flood alert and community resilience platform for the Philippines.

It is positioned as a **last-mile communication layer**: not a replacement for national warning infrastructure, but the community-facing system that translates hazard signals into street-level, actionable guidance before, during, and after floods.

Core operating principles:

- Barangay/street specificity over city-wide generic alerts
- Actionable decisions over passive information display
- Inclusion of low-connectivity and non-smartphone households
- Continuity through post-flood support and regeneration tracking

---

## 2. Problem Focus

AGOS addresses recurring gaps in current flood apps and warning channels:

- Alerts are often generic and not localized enough for household-level action.
- Communities need timing clarity ("how long do we have?"), safe routes, and resource locations.
- Most systems fail during connectivity loss (no offline/SMS continuity).
- Non-smartphone and low-literacy users are commonly excluded.
- Post-flood support and accountability loops are usually missing.

---

## 3. Target Users

- **Primary:** Flood-prone households in Metro Manila pilot zones (Marikina, Malabon, Navotas, Pasig)
- **Secondary:** LGU/DRRMO coordinators, barangay responders, community organizations
- **Inclusion segment:** Non-smartphone households reached via Flood Buddy relay + bulk SMS + barangay shared devices

---

## 4. Product Pillars

AGOS is defined across three resilience pillars plus inclusion:

| Pillar                       | What It Covers                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| **Mitigation**               | Trash & pollution reporting, preparedness actions, drainage hotspot visibility before flood events |
| **Response**                 | Real-time alerts, evacuation decision guidance, route advice, offline fallback, SMS continuity     |
| **Regeneration**             | Post-flood support and long-term recovery/accountability layers (Phase 2 heavy)                    |
| **Digital Inclusion Bridge** | Flood Buddy relay, bulk SMS, and shared access points for non-smartphone users                     |

---

## 5. MVP Scope (48-Hour Sprint)

The PDF defines a tight MVP with explicit deferrals. MVP includes:

1. **Real-Time Flood Alerts**
   - Barangay-level push alerts with `Watch / Warning / Danger`
   - Source priority: Google Weather API (PRIMARY)
   - Background service + permission re-prompt behavior

2. **Street-Level Depth Map**
   - Community depth pins (ankle/knee/waist/chest levels)
   - Pre-seeded by forecast/sensor signals to reduce cold start
   - Validation threshold: **3+ reports within 200m** for confirmation flows

3. **Evacuation Center Finder + Route Support**
   - Nearby centers and critical facilities
   - Community-informed route guidance and offline last-known route fallback
   - **Capacity display removed from MVP** due to reliability concerns

4. **Offline Fallback + SMS Continuity**
   - Cached emergency instructions and center list
   - Semaphore PH SMS fallback for critical alerts
   - Post-flood SMS updates are part of continuity behavior

5. **Evacuation Decision Engine (Rule-Based v1)**
   - Plain-language recommendation combining alert signal + local reports + household context
   - Recommendation-only (never auto-executes irreversible actions)

6. **Household Preparedness Kit**
   - Practical checklist/go-bag guidance with staged difficulty

7. **Multilingual Voice Layer (Scoped MVP)**
   - MVP delivery target is limited (Tagalog + one regional language)
   - Broader language coverage remains Phase 2

8. **Trash & Pollution Reporter (MVP functional version)**
   - Geotagged report capture and hotspot clustering
   - Lifecycle/accountability capabilities start in MVP and mature in Phase 2

9. **Digital Inclusion Bridge (MVP baseline)**
   - Flood Buddy relay logic + bulk SMS coverage

---

## 6. Explicit Phase 2 (Out of MVP Scope)

Deferred items include:

- Full multilingual coverage across Philippine languages
- Full LGU admin portal capabilities
- Post-flood regeneration dashboard and long-term pollution trends
- Donation system with PhilSys/barangay co-verification flows
- ML upgrade of Evacuation Decision Engine
- PhilAWARE data-sharing integration
- Media/NGO API products

When implementation trade-offs appear, MVP-safe choices take priority.

---

## 7. Current Tech Direction (Per PDF)

| Layer                   | Current Direction                          |
| ----------------------- | ------------------------------------------ |
| Mobile App              | React Native                               |
| Core Backend (MVP docs) | Firebase-centered implementation direction |
| Mapping & Routing       | Google Maps + Google Directions            |
| Flood Signal            | Google Flood Forecasting API (PRIMARY)     |
| Places/Resources        | Google Places API                          |
| SMS Continuity          | Semaphore PH                               |

Notes:

- Existing repository choices may differ from PDF architecture assumptions. Use this doc as product truth for behavior/scope.
- PAGASA is not treated as primary real-time source in this version.

---

## 8. Data and Validation Rules to Preserve

- Alerts remain barangay-targeted.
- Crowd confirmations use **3 reports / 200m** thresholds where confirmation gating is applied.
- Route guidance must expose uncertainty (best available, not guaranteed safe).
- Offline behavior is first-class, not an optional enhancement.
- AI/decision outputs must be transparent and user-confirmed in life-safety flows.

---

## 9. Critical Product Decisions

1. AGOS is a last-mile community platform, not a government-system replacement.
2. Hyper-local actionability is non-negotiable.
3. Digital inclusion is a core requirement, not a later accessibility add-on.
4. Regeneration/accountability is part of product identity, but major dashboards are deferred to Phase 2.
5. MVP must stay strictly scoped to protect 48-hour feasibility.

---

## 10. Risk and Execution Guardrails

- **Scope creep risk:** keep Phase 2 features out of MVP delivery unless explicitly re-scoped.
- **Data confidence risk:** avoid exposing unreliable metrics (for example, center capacity) as definitive.
- **Connectivity risk:** every critical flow needs an offline or SMS path.
- **Adoption risk:** ensure workflows support both app users and non-app households.

---

_Last updated: March 2026 (synced to AGOS PDF v4.x)_
