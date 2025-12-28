## Goal
Generate a single-page experience that visualizes Earth daylight and Venus visibility with interactive controls, using standard web tech and astronomy utilities for solar/lunar-style calculations.

## Must-have features
- 3D Earth globe with latitude/longitude grid, equator/tropics, and prime/180° meridians; day-side/visibility overlays for Sun and Venus; optional twilight band with configurable sun-below-horizon angle.
- Datetime control (UTC) with quick “now” and step buttons (sidereal day, day, hour, minute). Camera modes: geosync, sun-sync, dawn, dusk.
- One user-selectable point (lat/lon fields and globe click). Show local time for that point (auto-detect time zone from coords), Venus altitude at the point, and allow point plotting/highlighting.
- Direction arrows from the point: blue arrow for local “up”; green arrow toward Venus only when Venus is above the horizon (alt/az check).
- Orbit inset: 2D heliocentric sketch of Sun/Earth/Venus with distances (AU) and Venus elongation for the chosen time.

## Data and math expectations
- Compute Sun/Venus subpoints on Earth (geo subsolar/sub-Venus lat/lon).
- Compute Venus topocentric alt/az for the selected point; draw the Venus arrow only if altitude > 0.
- Derive local time via time-zone lookup from coordinates (e.g., `tz-lookup` or equivalent dataset); fall back to a sensible default if lookup fails.
- Orbit plot based on heliocentric positions projected to the ecliptic plane; include labels and simple styling.
- Arrow math hints: use a right-handed local frame (up = surface normal, north = d/dlat, east = north × up). For alt/az, build the direction vector as `dir = horiz * cos(alt) + up * sin(alt)`, where `horiz = north * cos(az) + east * sin(az)`. Normalize before drawing. Ensure cones align with the direction (set quaternion from world up to dir).

## Libraries (examples, not strict)
- 3D/rendering: Three.js (importmap/CDN) or equivalent.
- Astronomy: Astronomy Engine or similar ephemeris lib providing geo vectors, horizon coordinates, sidereal time.
- Time zone lookup: `tz-lookup` (unpkg/CDN) or any lat/lon → IANA resolver.

## Assets and UX
- Use a local Earth texture (e.g., `2k_earth_daymap.jpg`) for the globe.
- Responsive layout with side panels for controls/data; mobile-friendly toggles.
- Keep styling minimal but readable (dark theme, subtle borders), with info and control panels plus a footer credit area.
