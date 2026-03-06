# AGOS — Mobile UI Design System Guidelines

> Complete design language specification for AGOS: the flood alert and community resilience platform for the Philippines. Use this document to prompt AI tools, brief designers, or onboard developers into the visual system.

---

## 1. Design Philosophy

AGOS UI is built on one governing idea: **calm authority in crisis** .

The app is used by people who are scared, possibly in the dark, possibly elderly, possibly with wet hands on a cracked phone screen. Every design decision must serve that person — not the designer's portfolio.

| Principle                         | In Practice                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| **Legibility above all**          | Minimum 16px body text. Never sacrifice readability for aesthetics.                   |
| **Severity must be unmistakable** | Color, size, and motion all encode urgency. Never rely on color alone.                |
| **Map is the source of truth**    | The flood map anchors every navigation state. Users orient by geography.              |
| **Filipino-first copy**           | All alert strings rendered in Filipino (fil-PH) by default. English toggle available. |
| **One action per screen**         | Emergency UI collapses choices. Each state presents one primary action.               |
| **Offline-resilient visuals**     | UI must degrade gracefully. Cached tiles, local alert state, no blank screens.        |

---

## 2. Color System

### Foundation Palette

```
App Background       #070D1A    Deep midnight navy — primary screen bg
Card Surface         #0F1829    Slightly lighter navy — all cards and sheets
Card Surface Alt     #162038    Elevated cards, active states
Border               #1E2D45    Subtle structural lines
Border Light         #243450    Visible dividers, input borders
```

### Text

```
Text Primary         #F0F4FF    Near-white — headings, names, primary labels
Text Secondary       #7B8FA8    Muted blue-grey — metadata, captions, helper text
Text Disabled        #3D5068    Low-contrast — placeholders, inactive elements
Text on Alert        #FFFFFF    Always pure white on any alert color background
```

### Alert Severity — The Core Signal System

```
MONITOR    #3B82F6    Calm blue    "Rain expected. No immediate threat."
PREPARE    #F59E0B    Amber        "Flooding likely within 2 hours."
LEAVE      #F97316    Orange       "Leave within 30 minutes."
EVACUATE   #EF4444    Red          "Leave now." — always paired with pulse animation
```

> ⚠️ **Rule:** Alert colors MUST appear as both background tint AND icon/badge. Never use alert colors for decorative purposes. They are semantic signals only.

### Accent & Functional Colors

```
Water Blue           #38BDF8    Interactive elements, links, active icons
Water Blue (dim)     #0EA5E910  10% opacity — map overlays, subtle tints
Safe Green           #22C55E    Evacuation center open / route passable
Warning Red          #EF4444    Center full / route blocked
Map Pin Blue         #60A5FA    Confirmed flood report (deep)
Map Pin Yellow       #FCD34D    Confirmed flood report (shallow)
Map Pin Red          #F87171    Confirmed flood report (dangerous depth)
CTA Primary          #38BDF8    Primary interactive button
CTA Text             #070D1A    Text on primary CTA button
```

### Rules

- Never use purple, green gradients, or any color not in this system
- Alert colors (#3B82F6, #F59E0B, #F97316, #EF4444) are strictly reserved for severity levels
- Background is always dark — AGOS does not have a light mode in v1.0

---

## 3. Typography

### Typeface

```
Display / Headings:   "Outfit" — Bold, 700
Body / UI Labels:     "DM Sans" — Regular 400, Medium 500
Fallback:             "Outfit", "DM Sans", -apple-system, sans-serif
```

> **Why Outfit?** Strong geometric letterforms with excellent legibility at large sizes. The slightly rounded structure adds warmth to what could feel like a cold emergency app — appropriate for a Filipino community product.

### Type Scale

```
Alert Title (EVACUATE NOW)   32–36px    Outfit 700    Line-height: 1.1
Screen Title                 22–24px    Outfit 700    Line-height: 1.2
Section Heading              18px       Outfit 600    Line-height: 1.3
Card Title / Location Name   16px       DM Sans 500   Line-height: 1.4
Body Copy                    15px       DM Sans 400   Line-height: 1.5
Label / Badge Text           13px       DM Sans 500   Line-height: 1.4
Caption / Timestamp          12px       DM Sans 400   Line-height: 1.5
Micro / Legal                11px       DM Sans 400   Line-height: 1.6
```

### Rules

- All alert titles (EVACUATE, LEAVE, PREPARE) use Outfit 700 at 28px+ minimum
- Depth readings always use monospace-style tabular numbers: enable `font-variant-numeric: tabular-nums`
- Never use ALL CAPS in body text — use Outfit 700 Bold weight instead
- Text must always pass WCAG AA on its background. Check contrast, especially on alert overlays.

---

## 4. Spacing & Layout

### Mobile Grid

```
Screen width:         375px reference (iPhone SE)
Horizontal margin:    16px on each side
Safe area top:        44px (status bar)
Safe area bottom:     34px (home indicator)
Card padding:         16px horizontal, 14px vertical
Element gap:          12px (siblings), 20px (sections), 8px (compact rows)
```

### Border Radius Scale

```
Chip / Badge         6px
Input / Dropdown     10px
Card                 16px
Bottom Sheet         20px top corners, 0px bottom
Map Overlay Pill     24px (pill shape)
Avatar               50% (full circle)
Alert Banner         0px — full-width banners are always sharp-edged
Primary CTA Button   0px — AGOS uses square CTA buttons (same as Uber)
Secondary Button     10px
```

> ⚠️ **Signature rule:** Like Uber, AGOS primary CTA buttons have ZERO border radius. This creates a visual authority signal — square edges communicate "this is a command, not a suggestion."

### Elevation / Depth

- Cards: no shadow — separation comes from background color stepping (#070D1A → #0F1829)
- Bottom sheets: `0 -4px 24px rgba(0,0,0,0.4)` — stronger shadow appropriate for dark theme
- Alert banners: no shadow — they own the screen with color
- Map pins: `drop-shadow(0 2px 4px rgba(0,0,0,0.5))` for legibility on map tiles

---

## 5. The Alert Severity System (Core Component)

The severity indicator is the most critical UI component in AGOS. It appears on every screen in the nav bar and dominates the home screen.

### Severity States

```
┌─────────────────────────────────────────────┐
│  MONITOR  │ Blue   #3B82F6 │ No animation   │
│  PREPARE  │ Amber  #F59E0B │ Slow pulse 3s  │
│  LEAVE    │ Orange #F97316 │ Pulse 1.5s     │
│  EVACUATE │ Red    #EF4444 │ Fast pulse .8s │
└─────────────────────────────────────────────┘
```

### Alert Card Anatomy

```
┌──────────────────────────────────┐
│ [SEVERITY CHIP]  [Barangay Name] │  ← 13px label + 16px bold location
│                                  │
│  LEAVE WITHIN                    │  ← 14px DM Sans secondary
│  30 MINUTES                      │  ← 36px Outfit 700 primary command
│                                  │
│  [Nearest Center] is open →      │  ← 14px CTA link
│                                  │
│  [  SEE EVACUATION ROUTE  ]      │  ← Full-width square CTA button
└──────────────────────────────────┘
```

### Pulse Animation

```css
@keyframes alertPulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 currentColor40%;
  }
  50% {
    box-shadow: 0 0 0 12px currentColor0%;
  }
}
```

---

## 6. Component Specifications

### 6.1 — Map Screen

```
Map area:         65–70% of screen height, full-bleed
Depth pins:       Circle markers, 12–20px diameter, colored by depth
                  <30cm → Yellow #FCD34D
                  30–80cm → Orange #FB923C
                  >80cm → Red #F87171
NOAH overlay:     Semi-transparent polygon fill at 25% opacity
                  Risk zones use same color scale as depth pins
User location:    Animated concentric circles in #38BDF8 (water blue)
Report button:    Fixed bottom-right FAB: 56×56px circle, #38BDF8 bg,
                  wave/drop icon in #070D1A, no border radius on container card
```

### 6.2 — Bottom Nav Bar

```
Background:       #0F1829 with 1px top border #1E2D45
Height:           72px + safe area bottom
Tabs:             Home, Map, Centers, Report (4 tabs)
Active icon:      #38BDF8 (Water Blue) with 2px bottom indicator line
Inactive icon:    #3D5068
Tab label:        11px DM Sans 500
Alert dot:        6px circle in EVACUATE red, top-right of Home icon
                  Visible whenever alert level ≥ PREPARE
```

### 6.3 — Flood Report Pin Card (Map Tooltip)

```
Background:       #0F1829, 16px border radius
Min width:        220px
Depth reading:    28px Outfit 700, colored by severity
Address:          14px DM Sans 400, #7B8FA8
Time:             12px, #3D5068 — "Reported 4 min ago"
Confirmations:    "✓ 2 confirmations" in #22C55E — 12px
Close button:     Top-right × icon, 24px
```

### 6.4 — Evacuation Center Card

```
Status pill:      OPEN (#22C55E bg) / FULL (#EF4444 bg) — 6px radius, 11px bold
Center name:      16px DM Sans 500, #F0F4FF
Center type:      13px, #7B8FA8 — e.g. "Public school • Shelter"
Distance:         13px #38BDF8 — e.g. "1.2 km away"
Capacity bar:     Thin progress bar (4px height), green→red fill
Contact row:      Phone icon + number, 13px
Get Directions:   Secondary button, 10px radius, #162038 bg, #38BDF8 text
```

### 6.5 — Report Submission Sheet

```
Sheet:            Bottom sheet, 80% screen height, 20px top radius
Depth selector:   Large tap targets — 4 options in 2×2 grid
                  Ankle (< 15cm) / Knee (15–50cm) / Waist (50–100cm) / Above waist
                  Each tile: 64px tall, 16px radius, colored by severity
Photo upload:     Dashed border area, 16px radius, #1E2D45 border
                  "Mag-upload ng larawan" label in Filipino
Submit button:    Full-width, 0px radius, #38BDF8 bg, 56px height
                  "I-report ang Baha" (Filipino CTA copy)
Confirmation:     Checkmark animation + "Salamat!" toast notification
```

### 6.6 — Decision Engine Card (Home Screen)

```
This is the hero component — it dominates the top half of the Home screen.

Outer container:  Full-width, #0F1829, 16px radius
Alert stripe:     4px left border in severity color
State label:      13px Outfit 600 ALL CAPS severity name (MONITOR / PREPARE / LEAVE / EVACUATE)
Command text:     28–32px Outfit 700 — the plain-language instruction
Sub-instruction:  15px DM Sans 400 #7B8FA8 — e.g. "Flooding likely sa inyong barangay"
Timer:            Large countdown display (Outfit 700, 48px) when state = LEAVE
CTA button:       Full-width, 0px radius, height 56px
```

---

## 7. Iconography

### Style Rules

```
Weight:           Outline, 1.5px stroke
Size:             24px (navigation), 20px (card), 16px (inline)
Active state:     Fill the icon (outline → fill transition on active)
Color:            #F0F4FF primary, #38BDF8 interactive, severity colors for alerts
```

### Key Icons by Feature

```
Home / Dashboard:   House outline
Flood Map:          Layers / map pin
Evacuation:         Arrow-right-circle (exit/escape metaphor)
Report Flood:       Drop / wave icon
Alert:              Bell with dot
Safety:             Shield check
Flood Buddy:        People / users
Depth Shallow:      Ankle-height water wave
Depth Deep:         Full wave
Route:              Navigation arrow
Call:               Phone
SMS:                Chat bubble
```

> **Never use emoji as icons** in functional UI. Use icon set only (Phosphor Icons or Heroicons recommended — both have outline styles).

---

## 8. Motion & Animation

### Timing System

```
Instant:          0ms    — toggles, switches
Fast:             150ms  — hover states, icon changes
Standard:         250ms  — component transitions
Slow:             400ms  — sheet slides, screen transitions
Very Slow:        600ms  — page load reveals
```

### Named Animations

```
Sheet Slide Up:     translateY(100%) → translateY(0), 400ms ease-out
Alert Pulse:        box-shadow expand/fade loop — speed varies by severity
Map Pin Drop:       scale(0) → scale(1) + bounce, 300ms spring
Depth Confirm:      checkmark draw animation, 600ms
Toast Appear:       opacity 0→1 + translateY(-8px), 250ms ease-out
Countdown:          Digit flip animation (card flip), 1s interval
```

### Rules

- EVACUATE state triggers a persistent red pulse animation on the alert card
- Never animate decorative elements during EVACUATE state — all motion is reserved for the alert
- Bottom sheet appears from the bottom only — never slides from side
- Transitions use `ease-out` exclusively — no bounce, no elastic physics

---

## 9. Copy & Language Guidelines

### Tone

- **Direct but not cold.** "Umalis na kayo ngayon." (Leave now.) — not "Evacuation is recommended."
- **Community, not system.** Use "kayo/tayo" (you/we), not passive constructions.
- **Specific, not vague.** Always name the barangay. Always give a time. Never say "may baha" (there is flood) without a location.

### Alert Copy Templates (Filipino-first)

```
MONITOR:   "Inaasahan ang ulan. Suriin ang inyong go-bag."
PREPARE:   "Posibleng bahain ang [Barangay] sa loob ng 2 oras. Maghanda na."
LEAVE:     "Umalis sa loob ng 30 minuto. Bukas ang [Center Name]."
EVACUATE:  "UMALIS NA NGAYON. Tumawag sa inyong Flood Buddy kung kailangan ng tulong."
```

### CTA Button Copy

```
Primary action:       Always a verb + object in Filipino
                      "Tingnan ang Ruta" (View Route)
                      "I-report ang Baha" (Report Flood)
                      "Hanapin ang Shelter" (Find Shelter)
Secondary/cancel:     "Bumalik" (Go back) — never "Cancel" or "Dismiss"
```

---

## 10. Accessibility Requirements

| Requirement                        | Standard                                           |
| ---------------------------------- | -------------------------------------------------- |
| Minimum touch target               | 44×44px — all interactive elements                 |
| Minimum text contrast              | 4.5:1 WCAG AA — check all text on card surfaces    |
| Minimum body text size             | 15px — never go smaller for functional UI          |
| TTS trigger                        | Auto-play on PREPARE+ alert arrival (fil-PH voice) |
| Color alone never signals severity | Always pair color with text label AND icon         |
| SMS fallback                       | All alerts must also be deliverable as plain SMS   |
| Tap-to-enlarge                     | All map pins must show tooltip on single tap       |

---

## 11. Screen-by-Screen Summary

### Home / Alert Dashboard

- Decision Engine card dominates top half (severity + command + CTA)
- Below: 2–3 quick-info rows (nearest center, last report time, Flood Buddy status)
- Bottom: scrollable recent community reports feed

### Street-Level Flood Map

- Map fills 65% of screen
- Floating pill at top: current alert level for user's barangay
- Depth pins color-coded (Yellow / Orange / Red)
- NOAH risk zone layer as semi-transparent polygon
- FAB at bottom-right: "Mag-report" (Report flood)
- Bottom drawer: tap pin → show pin detail card

### Evacuation Center Finder

- Search/filter bar at top (type, distance, open only toggle)
- Card list view (no map in this tab — keeps it fast and simple)
- Each card: name, type, distance, capacity bar, status chip, directions button
- Empty state: "Walang bukas na center malapit sa inyo" + LGU contact

### Flood Report Submission

- Bottom sheet triggered from FAB on map
- Step 1: depth selector (4 large tap targets)
- Step 2: optional photo upload
- Step 3: confirm location (auto-detected, tap to correct)
- Submit → "Salamat!" toast + pin appears on map (grayed until 2 confirmations)

---

## 12. Prompt Template for AI

Use this template to generate any AGOS screen with an AI tool:

```
Design a [SCREEN NAME] screen for AGOS, a flood alert mobile app for the Philippines.

Visual specs:
- Dark theme: background #070D1A, card surface #0F1829
- Font: Outfit (headings, bold) + DM Sans (body, regular)
- Alert severity colors: Monitor #3B82F6 / Prepare #F59E0B / Leave #F97316 / Evacuate #EF4444
- Primary interactive color: #38BDF8 (water blue)
- Text: #F0F4FF primary, #7B8FA8 secondary
- Primary CTA button: full-width, 0px border radius (square), 56px height, #38BDF8 bg, #070D1A text
- Map area: 65% top of screen, full-bleed dark-style tiles
- Cards: 16px border radius, no shadows — bg color stepping creates depth
- Icons: 24px outline style, Phosphor or Heroicons

AGOS-specific requirements:
- All alert copy in Filipino (fil-PH)
- Severity must be shown via color + text label (never color alone)
- Current alert level: [MONITOR / PREPARE / LEAVE / EVACUATE]
- User's barangay: [BARANGAY NAME, CITY]

Screen contents: [DESCRIBE SCREEN CONTENTS HERE]
```

---

_AGOS Design System v1.0 — March 2026_
_Stack: React Native + Supabase + Google Maps SDK_
_Target: iOS + Android, Philippines_
