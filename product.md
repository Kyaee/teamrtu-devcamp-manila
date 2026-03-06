# AGOS — AI Product Context File

> This file contains the full accumulated context of the AGOS product as defined across a development conversation. Use this to continue work on AGOS without losing prior decisions, rationale, or architecture.

---

## 1. What is AGOS? (name not final)

**AGOS** (Filipino for "flow") is a **mobile-first flood alert and community resilience platform** built specifically for the Philippines. Its core mission is to bridge the "last-mile" gap in disaster communication — moving beyond generic city-wide weather advisories to deliver **hyper-local, street-level, actionable flood intelligence** before, during, and after flood events.

It is NOT trying to solve flooding as an infrastructure problem. It is solving the **communication and decision-making gap** that causes preventable deaths when people don't know if their specific street will flood, when to leave, or where to go.

---

## 2. The Problem Being Solved

- Existing systems give city-wide weather advisories. AGOS gives **street-level specificity** .
- Flood events in the Philippines have increased fourfold since 1980. Metro Manila, Marikina, Malabon, Cagayan Valley, and Pampanga are chronically affected.
- Survivors express a desperate need for two things: **timing** ("how much time do I have?") and **post-flood resource locations** (food, aid registration).
- Social vulnerability factors — poverty, age, disability — are not reflected in current government alerts.
- The government owns the infrastructure problem. AGOS owns the **last-mile communication problem** , which the government has consistently failed to solve.

---

## 3. Target Users

- **Primary:** Residents in high-vulnerability barangays (Marikina, Malabon, Cagayan Valley, Pampanga)
- **Secondary:** Local Government Units (LGUs), NGOs, community organizations
- **Edge cases served:** Elderly users, low-literacy users, users without smartphones (via Flood Buddy Network + SMS)

---

## 4. The Four Product Pillars

These are the core differentiators that define AGOS. Every feature maps back to one of these:

| Pillar                         | Description                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Evacuation Decision Engine** | Synthesizes rainfall data, crowdsourced reports, and household profiles to produce plain-language instructions (e.g., "Leave within 30 minutes") |
| **Hyper-Local Crowdsourcing**  | "Human sensors" map street-level flood depths. Proven to achieve up to 95% accuracy comparable to IoT sensors                                    |
| **Flood Buddy Network**        | Designated community volunteers relay alerts to neighbors without smartphones or internet access                                                 |
| **Resilience & Recovery**      | Gamified preparedness tracker, post-flood mental health check-ins, and digital aid registration to reduce physical queuing                       |

---

## 5. Confirmed MVP Features (v1.0)

These four features constitute the 48-hour MVP sprint scope. Nothing else is in scope for the MVP.

### 5.1 Real-Time Flood Alert

- Push notifications with three severity levels: **Watch / Warning / Danger**
- Tied to Google Weather API data and crowdsourced depth report confirmations
- Alerts are **barangay-specific** , never city-wide
- Audio playback via Google TTS API for accessibility

### 5.2 Street-Level Depth Map

- Interactive Google Maps-based map
- Community-submitted flood depth reports shown as **color-coded severity pins**
- Report submission is designed to take under 10 seconds
- A report is only surfaced publicly after **2 independent confirmations within 500m radius in 30 minutes** (anti-false-report consensus model)

### 5.3 Evacuation Center Finder

- Directory of active evacuation centers: schools, hospitals, shelters, malls
- Shows reported capacity status (full / available), amenities, and contact info
- GPS routing via Google Directions API
- Updated by LGU admins and community reporters
- Road passability checked via Google Maps Roads API before recommending a route

### 5.4 Offline SMS Fallback

- Core alerts delivered via **Semaphore PH SMS API** when internet is unavailable
- Triggered when alert level reaches Orange or Red in an area with registered Flood Buddies
- SMS message template: barangay name + flood level + nearest open evacuation center + ETA
- Flood Buddy recipients stored in `registered_buddies` table with mobile numbers and coverage zones

---

## 6. Approved Technology Stack

| Layer              | Technology                | Reason for Choice                                                                                                                    |
| ------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend           | React Native              | Cross-platform iOS + Android from a single codebase                                                                                  |
| Backend / Database | Supabase (PostgreSQL)     | Relational data model fits AGOS's linked entities; real-time subscriptions built-in; scales better than Firebase for complex queries |
| Mapping            | Google Maps SDK           | Base map, overlays, routing, places — all in one SDK                                                                                 |
| Weather Data       | Google Weather API        | Native Maps SDK integration; includes precipitation alerts, storm surge warnings, 240hr forecasts; 10,000 free calls/month           |
| Accessibility      | Google Text-to-Speech API | Filipino (fil-PH) language support; 1M free characters/month; auto-triggered on alert receipt                                        |
| SMS Fallback       | Twilio                    | Valid SMS alternative to Semaphore PH at scale;                                                                                      |

### Rejected / Deferred Alternatives

- **Firebase** — Chosen over for MVP speed, but Supabase preferred long-term due to relational data needs
- **Windy.com API** — Considered for weather visualization; rejected due to $720/year cost. Free tier too limited.
- **PocketBase** — Suggested for pure prototype speed; deferred in favor of Supabase for architectural consistency

---

## 7. Government Data Sources

| Source                  | URL                          | Status                                                       | Usage                                                                   |
| ----------------------- | ---------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| PHILSENSORS (DOST-ASTI) | philsensors.asti.dost.gov.ph | Requires formal data-sharing request — not a public API      | Real-time river/rainfall sensor data layered on map                     |
| Project NOAH (UP)       | noah.up.edu.ph               | **Freely available **under Open Database License             | Static high-resolution flood hazard zone shapefiles (Yellow/Orange/Red) |
| PAGASA                  | pagasa.dost.gov.ph           | No public REST API; website only — unreliable for production | Reference layer only; not used in alert logic                           |

### Implementation Note on Project NOAH

NOAH shapefiles must be downloaded, converted to GeoJSON (using GDAL or mapshaper), and hosted as a static asset in Supabase Storage. This is a one-time import, not a live API call. It becomes the persistent base risk layer on the map.

### Implementation Note on PHILSENSORS

Submit a formal data-sharing request to DOST-ASTI. Approval is likely given AGOS's disaster-relief mission, especially if backed by an LGU or academic institution. In the meantime, use **OpenWeatherMap API** or **Open-Meteo** (free, no key needed) as fallback.

---

## 8. Evacuation Decision Engine — Logic Detail

The engine runs as a **Supabase Edge Function (Deno runtime)** every 5 minutes during active weather events.

### Inputs & Weights

| Input                           | Source                     | Weight                            |
| ------------------------------- | -------------------------- | --------------------------------- |
| Real-time rainfall intensity    | Google Weather API         | High — primary trigger            |
| River / water level sensor data | PHILSENSORS                | High — early flood onset signal   |
| Confirmed crowdsource reports   | Supabase validated reports | High — ground truth               |
| Static flood hazard zone        | Project NOAH GeoJSON       | Medium — baseline risk multiplier |
| Household vulnerability profile | Supabase user profile      | Medium — personalizes urgency     |
| Evacuation route passability    | Google Maps Roads API      | Medium — affects time-to-leave    |

### Output States

| State                   | Message                                                 |
| ----------------------- | ------------------------------------------------------- |
| MONITOR                 | "Rain expected. Check your preparedness kit."           |
| PREPARE                 | "Flooding likely within 2 hours. Pack your go-bag now." |
| LEAVE WITHIN 30 MINUTES | "[Nearest center] is open. Route shown on map."         |
| EVACUATE IMMEDIATELY    | "Leave now. Call your Flood Buddy if you need help."    |

Messages are rendered in **Filipino (fil-PH)** via Google TTS API. Each state triggers a corresponding push notification and optional SMS broadcast.

---

## 9. Supabase Data Architecture

### Core Tables

| Table                | Key Fields                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `users`              | id, phone, barangay_id, household_profile (JSONB), disability_flags, flood_buddy_status                       |
| `flood_reports`      | id, user_id, lat, lng, depth_cm, photo_url, confirmed_count, created_at                                       |
| `alerts`             | id, barangay_id, alert_level, message_fil, message_en, audio_url, created_at                                  |
| `evac_centers`       | id, name, type (school/hospital/shelter/mall), lat, lng, capacity, current_occupancy, is_open, contact_number |
| `registered_buddies` | id, user_id, mobile_number, coverage_zone, is_active                                                          |
| `flood_zones`        | id, geometry (PostGIS), risk_level, source (NOAH)                                                             |

### Real-Time Subscriptions (Supabase Realtime)

- `flood_reports` → new reports near user trigger live map updates
- `alerts` → new alert records trigger push + TTS playback
- `evac_centers` → capacity and `is_open` changes update the list live

---

## 10. 48-Hour MVP Sprint Plan

| Phase            | Hours | Deliverable                                                          |
| ---------------- | ----- | -------------------------------------------------------------------- |
| Setup            | 0–4   | Supabase project, React Native scaffold, all API keys                |
| Map + Reports    | 4–16  | Google Maps base, NOAH overlay, report submission + display          |
| Alerts + SMS     | 16–28 | Decision Engine (simplified), push notifications, Semaphore SMS test |
| Evacuation + TTS | 28–40 | Evacuation center finder, GPS routing, TTS audio alert               |
| Polish + Demo    | 40–48 | UI cleanup, demo data seeding, walkthrough                           |

---

## 11. Key Product Decisions & Rationale

These are decisions explicitly made during the product conversation. Do not reverse these without strong justification.

1. **Supabase over Firebase** — Chosen for relational data integrity. AGOS data is inherently relational (users → barangays, reports → streets, alerts → zones). Firebase's NoSQL model becomes unmanageable as the app scales.
2. **Crowdsource consensus model (2 reports / 500m / 30min)** — Prevents false reports from triggering public alerts. Balances speed vs. accuracy.
3. **Barangay-level alerts, not city-wide** — Core differentiator from PAGASA/existing systems. Never compromise on this.
4. **Google TTS in Filipino** — Directly addresses research finding that elderly and low-literacy users are most at-risk and least served by text-only alerts.
5. **Project NOAH as static layer, not live API** — NOAH doesn't offer a live REST API. Data is imported once and updated periodically, not fetched at runtime.
6. **Semaphore PH as primary SMS, Twilio as backup** — Semaphore is Philippine-native and cheaper per SMS. Twilio retained as fallback for scale or outage.
7. **Scope of the product** — AGOS does NOT try to solve flooding as an infrastructure problem (government's responsibility). It solves the last-mile communication failure. The floods are the entry point; environmental resilience is the long-term vision (Phase 2+).

---

## 12. Long-Term Vision (Post-MVP, Phase 2+)

These ideas were generated but are explicitly out of scope for the MVP. They represent the product's environmental and policy roadmap:

- **Citizen Science Layer** — Users log water color, smell, debris type to build a pollution map
- **Illegal Dumping Reports** — One-tap reporting routed to DENR or city sanitation
- **Community Tree & Mangrove Tracker** — Volunteers map natural flood buffers; gamified with badges
- **Flood-Prone Land Tagging** — Crowdsource vacant lots suitable for rain gardens / bioswales
- **Post-Flood Debris Coordination** — Maps waste hotspots and connects them to cleanup volunteers
- **LGU Environmental Dashboard** — Anonymized community data packaged for LGU budget justification
- **School Integration Module** — DepEd partnership using AGOS data for science projects on watershed health
- **Historical Environmental Timeline** — Year-over-year visualization of flood severity, water quality, green cover

---

## 13. Technical Risks & Mitigations

| Risk                                                    | Mitigation                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| PHILSENSORS access denied                               | Use OpenWeatherMap as fallback; apply in parallel           |
| Semaphore credits depleted during mass alert            | Twilio as secondary; set cost alerts on Semaphore           |
| Google Maps quota exceeded during typhoon traffic spike | Implement tile caching + offline map tiles in React Native  |
| Supabase Realtime drops on poor mobile signal           | 30-second polling fallback when WebSocket disconnects       |
| False crowdsource reports mislead users                 | Minimum 2 independent confirmations before public surfacing |

---

## 14. Cost Summary

| Service               | Free Tier               | Notes                                 |
| --------------------- | ----------------------- | ------------------------------------- |
| Google Maps SDK       | $200/mo credit          | Shared across all Google Maps APIs    |
| Google Weather API    | 10,000 calls/month      | Includes precipitation + storm alerts |
| Google TTS API        | 1M characters/month     | fil-PH voice supported                |
| Google Directions API | $200/mo credit (shared) | —                                     |
| Supabase              | 500MB DB, 50K MAU       | $25/mo Pro when scaling               |
| Semaphore PH          | No free tier            | ~PHP 0.35/SMS prepaid                 |
| PHILSENSORS           | Free (with approval)    | Formal DOST-ASTI request required     |
| Project NOAH          | Free — Open DB License  | One-time shapefile download           |

---

_Last updated: March 2026 | Stack: React Native + Supabase + Google Maps SDK + Google Weather API + Google TTS + Semaphore PH_
