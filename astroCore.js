// Shared math and astronomy helpers used by the Earth viewer (language-agnostic).
const Astronomy = globalThis.Astronomy;

export const TAU = Math.PI * 2;
export const SIDEREAL_MS = 86164000; // 23h56m4s in milliseconds
export const anchorYear = new Date().getUTCFullYear();
export const isLeapYear = (year) => (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
export const daysInYear = (year) => (isLeapYear(year) ? 366 : 365);
export const pad2 = (n) => String(n).padStart(2, '0');
export const EOT_ZERO_MS = Date.UTC(anchorYear, 3, 15, 12, 0, 0, 0); // ~Apr 15, EoT near zero
export const normalizeDeg = (deg) => {
  let d = ((deg + 180) % 360) - 180;
  if (d < -180) d += 360;
  return d;
};
export const wrap360 = (deg) => ((deg % 360) + 360) % 360;
export const OBLIQUITY_RAD = 23.439291111 * Math.PI / 180;

export const alignMeanRealNearEotZero = (poiLon) => {
  const base = new Date(EOT_ZERO_MS);
  const dayStart = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  const frac = ((180 - poiLon) / 360) % 1;
  const dayMs = 86400000;
  const target = new Date(dayStart + ((frac + 1) % 1) * dayMs);
  return target;
};

export const seasonDate = (month, day, hour = 12) => `${anchorYear}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:00`;

export const vectorToRaDec = (vec) => {
  const raRad = Math.atan2(vec.y, vec.x);
  const ra = ((raRad % TAU) + TAU) % TAU; // 0..2pi
  const dec = Math.atan2(vec.z, Math.hypot(vec.x, vec.y));
  return { raHours: ra * 12 / Math.PI, decDeg: dec * Astronomy.RAD2DEG };
};

export const vectorToEclipticLonDeg = (vec) => {
  const cosEps = Math.cos(OBLIQUITY_RAD);
  const sinEps = Math.sin(OBLIQUITY_RAD);
  const x = vec.x;
  const y = vec.y * cosEps + vec.z * sinEps;
  return wrap360(Math.atan2(y, x) * Astronomy.RAD2DEG);
};

export const sunEclipticLonDeg = (date) => {
  const time = Astronomy.MakeTime(date);
  const vec = Astronomy.GeoVector(Astronomy.Body.Sun, time, true);
  return vectorToEclipticLonDeg(vec);
};

export const subpointFromBody = (body, date) => {
  const time = Astronomy.MakeTime(date);
  const vec = Astronomy.GeoVector(body, time, true);
  const { raHours, decDeg } = vectorToRaDec(vec);
  const gast = Astronomy.SiderealTime(time); // hours
  const lon = normalizeDeg((raHours - gast) * 15);
  return { lat: decDeg, lon };
};

export const meanSunSubpoint = (date) => {
  const when = date || new Date();
  const dayStart = Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate());
  const dayFrac = (when.getTime() - dayStart) / 86400000; // fraction of UTC day
  const lon = normalizeDeg(180 - dayFrac * 360);
  return { lat: 0, lon };
};

export const getSubpoints = (date, includeMean = false) => {
  const when = date || new Date();
  const realSun = subpointFromBody(Astronomy.Body.Sun, when);
  return {
    sun: realSun,
    moon: subpointFromBody(Astronomy.Body.Moon, when),
    meanSun: includeMean ? meanSunSubpoint(when) : null
  };
};

const sunDeclinationCache = { year: null, values: [] };
export const sunDeclinationForYear = (year) => {
  if (sunDeclinationCache.year === year && sunDeclinationCache.values.length) {
    return sunDeclinationCache.values;
  }
  const days = daysInYear(year);
  const decs = new Array(days);
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.UTC(year, 0, 1 + i, 12, 0, 0, 0));
    decs[i] = subpointFromBody(Astronomy.Body.Sun, date).lat;
  }
  sunDeclinationCache.year = year;
  sunDeclinationCache.values = decs;
  return decs;
};

export const daylightHoursAtAltitude = (latDeg, decDeg, altDeg) => {
  const alt0 = altDeg * Math.PI / 180;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lat = clamp(latDeg, -90, 90) * Math.PI / 180;
  const dec = clamp(decDeg, -90, 90) * Math.PI / 180;
  const cosH0 = (Math.sin(alt0) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
  if (cosH0 >= 1) return { day: 0, night: 24 };
  if (cosH0 <= -1) return { day: 24, night: 0 };
  const h0 = Math.acos(cosH0); // radians
  const day = 24 * h0 / Math.PI;
  return { day, night: 24 - day };
};

export const daylightHours = (latDeg, decDeg) => daylightHoursAtAltitude(latDeg, decDeg, -0.833);
