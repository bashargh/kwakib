export const createAnalemmaCharts = ({
  analemmaUi,
  isAnalemmaPage,
  copyText,
  formatCopy,
  pad2,
  normalizeDeg,
  wrap360,
  OBLIQUITY_RAD,
  sunEclipticLonDeg,
  getSubpoints,
  meanSunSubpoint,
  daysInYear,
  TAU,
  SIDEREAL_MS,
  getDateTimeValue,
  parseUTC
}) => {
  const ORBIT_E = 0.0167;
  const ORBIT_A = 1;
  const SIDEREAL_DAYS = SIDEREAL_MS / 86400000;
  const getDayOfYear = (date) => {
    const start = Date.UTC(date.getUTCFullYear(), 0, 1);
    return (date.getTime() - start) / 86400000;
  };
  const solveKepler = (M, e) => {
    let E = M;
    for (let i = 0; i < 6; i += 1) {
      const f = E - e * Math.sin(E) - M;
      const fPrime = 1 - e * Math.cos(E);
      E -= f / (fPrime || 1);
    }
    return E;
  };
  const orbitStateForDay = (day, yearDays) => {
    const M = TAU * (day / yearDays);
    const E = solveKepler(M, ORBIT_E);
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const r = ORBIT_A * (1 - ORBIT_E * cosE);
    const f = Math.atan2(Math.sqrt(1 - ORBIT_E * ORBIT_E) * sinE, cosE - ORBIT_E);
    const x = r * Math.cos(f);
    const y = r * Math.sin(f);
    const speed = Math.sqrt(Math.max(0, 2 / r - 1));
    return { x, y, r, speed };
  };
  const sunAngleForDay = (day, yearDays) => {
    const state = orbitStateForDay(day, yearDays);
    return Math.atan2(-state.y, -state.x);
  };
  const normalizeAngle = (rad) => ((rad % TAU) + TAU) % TAU;
  const setCanvasSize = (canvas, cssW, cssH) => {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const needW = Math.round(cssW * dpr);
    const needH = Math.round(cssH * dpr);
    if (canvas.width !== needW) canvas.width = needW;
    if (canvas.height !== needH) canvas.height = needH;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    return dpr;
  };
  const updateEccentricityBaseDate = (overrideDate) => {
    const date = overrideDate ?? (parseUTC(getDateTimeValue?.() || '') ?? new Date());
    const baseDay = getDayOfYear(date);
    const yearDays = daysInYear(date.getUTCFullYear());
    return { date, baseDay, yearDays };
  };
  const drawOrbitCanvas = (canvas, baseDay, animDay, yearDays) => {
    if (!canvas) return;
    const parentW = canvas.parentElement?.clientWidth || 520;
    const cssW = Math.max(240, Math.floor(parentW));
    const cssH = Math.round(cssW * 0.62);
    const dpr = setCanvasSize(canvas, cssW, cssH);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.direction = 'ltr';
    ctx.clearRect(0, 0, cssW, cssH);

    const windowDays = 60;
    const step = 1;
    const pts = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = -windowDays; i <= windowDays; i += step) {
      const state = orbitStateForDay(animDay + i, yearDays);
      pts.push(state);
      if (state.x < minX) minX = state.x;
      if (state.x > maxX) maxX = state.x;
      if (state.y < minY) minY = state.y;
      if (state.y > maxY) maxY = state.y;
    }
    const pad = 28;
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const scale = Math.min((cssW - pad * 2) / spanX, (cssH - pad * 2) / spanY);
    const mapPoint = (p) => ({
      x: pad + (p.x - minX) * scale,
      y: pad + (maxY - p.y) * scale
    });

    ctx.strokeStyle = 'rgba(220,230,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach((p, idx) => {
      const mp = mapPoint(p);
      if (idx === 0) ctx.moveTo(mp.x, mp.y);
      else ctx.lineTo(mp.x, mp.y);
    });
    ctx.stroke();

    const sunInView = (0 >= minX && 0 <= maxX && 0 >= minY && 0 <= maxY);
    if (sunInView) {
      const sunP = mapPoint({ x: 0, y: 0 });
      ctx.fillStyle = 'rgba(255,200,100,0.95)';
      ctx.beginPath();
      ctx.arc(sunP.x, sunP.y, 6, 0, TAU);
      ctx.fill();
    }

    const arcDays = SIDEREAL_DAYS * 2;
    ctx.strokeStyle = 'rgba(255,180,80,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 12; i += 1) {
      const d = animDay + (arcDays * i) / 12;
      const state = orbitStateForDay(d, yearDays);
      const mp = mapPoint(state);
      if (i === 0) ctx.moveTo(mp.x, mp.y);
      else ctx.lineTo(mp.x, mp.y);
    }
    ctx.stroke();

    const animState = orbitStateForDay(animDay, yearDays);
    const baseState = orbitStateForDay(baseDay, yearDays);
    const animP = mapPoint(animState);
    const baseP = mapPoint(baseState);
    ctx.fillStyle = 'rgba(120,200,255,0.95)';
    ctx.beginPath();
    ctx.arc(baseP.x, baseP.y, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(animP.x, animP.y, 4, 0, TAU);
    ctx.fill();
  };
  const drawSpeedCanvas = (canvas, baseDay, yearDays) => {
    if (!canvas) return;
    const parentW = canvas.parentElement?.clientWidth || 520;
    const cssW = Math.max(240, Math.floor(parentW));
    const cssH = Math.round(cssW * 0.45);
    const dpr = setCanvasSize(canvas, cssW, cssH);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cssW, cssH);

    const padding = 40;
    const plotW = cssW - padding * 2;
    const plotH = cssH - padding * 2;
    const angles = new Array(yearDays);
    let minV = Infinity;
    let maxV = -Infinity;
    for (let i = 0; i < yearDays; i += 1) {
      const sun0 = sunAngleForDay(i, yearDays);
      const sun1 = sunAngleForDay(i + SIDEREAL_DAYS, yearDays);
      const delta = ((sun1 - sun0 + Math.PI) % TAU) - Math.PI;
      const deg = delta * 180 / Math.PI;
      angles[i] = deg;
      if (deg < minV) minV = deg;
      if (deg > maxV) maxV = deg;
    }
    const scaleY = plotH / (maxV - minV || 1);
    const toX = (day) => padding + (day / (yearDays - 1)) * plotW;
    const toY = (v) => padding + (maxV - v) * scaleY;

    ctx.strokeStyle = 'rgba(150,200,255,0.65)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + plotH);
    ctx.lineTo(padding + plotW, padding + plotH);
    ctx.stroke();

    const meanExtraDeg = 360 / 365.25;
    const meanY = toY(meanExtraDeg);
    ctx.strokeStyle = 'rgba(255,214,85,0.85)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padding, meanY);
    ctx.lineTo(padding + plotW, meanY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(120,200,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < yearDays; i += 1) {
      const x = toX(i);
      const y = toY(angles[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const baseDayWrapped = ((baseDay % yearDays) + yearDays) % yearDays;
    const markerX = toX(baseDayWrapped);
    const markerY = toY(angles[Math.floor(baseDayWrapped)]);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(markerX, markerY, 4, 0, TAU);
    ctx.fill();

    const labelColor = 'rgba(235,245,255,0.95)';
    ctx.strokeStyle = 'rgba(235,245,255,0.35)';
    ctx.lineWidth = 1;
    ctx.fillStyle = labelColor;
    ctx.font = '12.5px "Segoe UI", Arial, sans-serif';

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i += 1) {
      const val = minV + ((maxV - minV) * i) / 4;
      const y = toY(val);
      ctx.beginPath();
      ctx.moveTo(padding - 6, y);
      ctx.lineTo(padding, y);
      ctx.stroke();
      ctx.fillText(val.toFixed(3), padding - 10, y);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i += 1) {
      const day = Math.round((yearDays - 1) * i / 4);
      const x = toX(day);
      ctx.beginPath();
      ctx.moveTo(x, padding + plotH);
      ctx.lineTo(x, padding + plotH + 6);
      ctx.stroke();
      ctx.fillText(String(day), x, padding + plotH + 10);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('deg', padding + 4, padding - 8);
  };
  const renderEccentricityCharts = () => {
    const { baseDay, yearDays } = updateEccentricityBaseDate();
    const speedCanvas = document.getElementById('eccSpeedCanvas');
    drawSpeedCanvas(speedCanvas, baseDay, yearDays);
  };
  const formatIsoDate = (date) => (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
  );
  const formatAbsMinSec = (secondsFloat) => {
    const seconds = Math.round(Math.abs(secondsFloat));
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    return `${mm}m ${String(ss).padStart(2, '0')}s`;
  };
  const formatNextNoonLabel = (deltaSeconds) => {
    if (Math.abs(deltaSeconds) < 0.5) return copyText('noonUnchanged', 'unchanged');
    const abs = formatAbsMinSec(deltaSeconds);
    if (deltaSeconds > 0) return formatCopy('noonEarlier', '{value} earlier', { value: abs });
    return formatCopy('noonLater', '{value} later', { value: abs });
  };
  const clampDayIndex = (day, yearDays) => (
    Math.max(0, Math.min(yearDays - 1, Math.round(day)))
  );
  const getDateForDay = (year, dayIndex) => new Date(Date.UTC(year, 0, 1 + dayIndex));
  const lonCompressionForLambda = (lambdaDeg) => {
    const l0 = lambdaDeg * Math.PI / 180;
    const l1 = (lambdaDeg + 1) * Math.PI / 180;
    const cosEps = Math.cos(OBLIQUITY_RAD);
    const radToDeg = 180 / Math.PI;
    const ra0 = wrap360(Math.atan2(Math.sin(l0) * cosEps, Math.cos(l0)) * radToDeg);
    const ra1 = wrap360(Math.atan2(Math.sin(l1) * cosEps, Math.cos(l1)) * radToDeg);
    return Math.abs(normalizeDeg(ra1 - ra0));
  };
  const computeEccentricitySeries = (yearDays) => {
    const angles = new Array(yearDays);
    let minV = Infinity;
    let maxV = -Infinity;
    for (let i = 0; i < yearDays; i += 1) {
      const sun0 = sunAngleForDay(i, yearDays);
      const sun1 = sunAngleForDay(i + SIDEREAL_DAYS, yearDays);
      const delta = ((sun1 - sun0 + Math.PI) % TAU) - Math.PI;
      const deg = delta * 180 / Math.PI;
      angles[i] = deg;
      if (deg < minV) minV = deg;
      if (deg > maxV) maxV = deg;
    }
    return { angles, minV, maxV, meanExtraDeg: 360 / 365.25 };
  };
  const computeObliquitySeries = (year, yearDays) => {
    const factors = new Array(yearDays);
    let minV = Infinity;
    let maxV = -Infinity;
    for (let i = 0; i < yearDays; i += 1) {
      const dt = getDateForDay(year, i);
      const lambda = sunEclipticLonDeg(dt);
      const factor = lonCompressionForLambda(lambda);
      factors[i] = factor;
      if (factor < minV) minV = factor;
      if (factor > maxV) maxV = factor;
    }
    return { factors, minV, maxV };
  };
  const computeAnalemmaContributionSeries = (year, yearDays) => {
    const eccSeconds = new Array(yearDays);
    const obliqSeconds = new Array(yearDays);
  const combinedSeconds = new Array(yearDays);
  let maxAbsSeconds = 0;
  let eotSeconds0 = null;
  const meanExtraDeg = 360 / 365.25;
  for (let i = 0; i < yearDays; i += 1) {
      const dt0 = getDateForDay(year, i);
      const dt1 = new Date(dt0.getTime() + SIDEREAL_MS);
      const sun0 = getSubpoints(dt0, false)?.sun;
      const sun1 = getSubpoints(dt1, false)?.sun;
      const mean0 = meanSunSubpoint(dt0);
      const mean1 = meanSunSubpoint(dt1);
      if (!sun0 || !sun1 || !mean0 || !mean1) {
        eccSeconds[i] = 0;
        obliqSeconds[i] = 0;
        combinedSeconds[i] = 0;
        continue;
      }
      if (i === 0) {
        eotSeconds0 = normalizeDeg(mean0.lon - sun0.lon) * 240;
      }
      const deltaLambda = normalizeDeg(sunEclipticLonDeg(dt1) - sunEclipticLonDeg(dt0));
      const realDeltaLon = normalizeDeg(sun1.lon - sun0.lon);
      const meanDeltaLon = normalizeDeg(mean1.lon - mean0.lon);
      const eccSec = (deltaLambda - meanExtraDeg) * 240;
      const obliqSec = (realDeltaLon - deltaLambda) * 240;
      const combinedSec = (meanDeltaLon - realDeltaLon) * 240;
      eccSeconds[i] = eccSec;
      obliqSeconds[i] = obliqSec;
    combinedSeconds[i] = combinedSec;
    maxAbsSeconds = Math.max(maxAbsSeconds, Math.abs(eccSec), Math.abs(obliqSec), Math.abs(combinedSec));
  }
    const accumulate = (values) => {
      const acc = new Array(values.length);
      let total = 0;
      for (let j = 0; j < values.length; j += 1) {
        const value = Number.isFinite(values[j]) ? values[j] : 0;
        total += value;
        acc[j] = total;
      }
      return acc;
    };
    const eccAccum = accumulate(eccSeconds);
    const obliqAccum = accumulate(obliqSeconds);
    const obliqAnchorSec = -180;
    const obliqOffset = Number.isFinite(obliqAccum[0]) ? (obliqAnchorSec - obliqAccum[0]) : 0;
    const obliqAdjusted = obliqAccum.map((value) => (Number.isFinite(value) ? value + obliqOffset : value));
    const combinedAccum = accumulate(combinedSeconds);
    const offset = Number.isFinite(eotSeconds0) ? (eotSeconds0 - (combinedAccum[0] ?? 0)) : 0;
    const combinedAdjusted = combinedAccum.map((value) => (Number.isFinite(value) ? value + offset : value));
    const maxAccum = Math.max(...eccAccum.map(v => Math.abs(v)), ...obliqAdjusted.map(v => Math.abs(v)), ...combinedAdjusted.map(v => Math.abs(v)));
    return {
      eccSeconds: eccAccum,
      obliqSeconds: obliqAdjusted,
      combinedSeconds: combinedAdjusted,
      yearDays,
      maxAbsSeconds: Math.max(maxAccum, 0.5)
    };
  };
  const ensureAnalemmaCache = (year, yearDays) => {
    if (!analemmaUi.cache || analemmaUi.cache.year !== year || analemmaUi.cache.yearDays !== yearDays) {
      analemmaUi.cache = {
        year,
        yearDays,
        ecc: computeEccentricitySeries(yearDays),
        obliq: computeObliquitySeries(year, yearDays),
        combined: computeAnalemmaContributionSeries(year, yearDays)
      };
    }
  };
  const renderEccentricityChart = (canvas, series, baseDay) => {
    if (!canvas || !series) return;
    const parentW = canvas.parentElement?.clientWidth || 520;
    const cssW = Math.max(260, Math.floor(parentW));
    const maxH = analemmaUi.chartHeights?.ecc ?? Infinity;
      const cssH = Math.min(Math.round(cssW * 0.92), maxH);
      const dpr = setCanvasSize(canvas, cssW, cssH);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      const eccCard = canvas.closest('.analemma-card');
      const eccSpacer = eccCard?.querySelector('.analemma-card-spacer');
      if (eccSpacer) eccSpacer.style.height = `${cssH}px`;

    const padding = 48;
    const plotW = cssW - padding * 2;
    const plotH = cssH - padding * 2;
    const minV = series.minV;
    const maxV = series.maxV;
    const yearDays = series.angles.length;
    const scaleY = plotH / (maxV - minV || 1);
    const toX = (day) => padding + (day / (yearDays - 1)) * plotW;
    const toY = (v) => padding + (maxV - v) * scaleY;

    ctx.strokeStyle = 'rgba(150,200,255,0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + plotH);
    ctx.lineTo(padding + plotW, padding + plotH);
    ctx.stroke();

    const meanY = toY(series.meanExtraDeg);
    ctx.strokeStyle = 'rgba(255,214,85,0.55)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padding, meanY);
    ctx.lineTo(padding + plotW, meanY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(120,200,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < yearDays; i += 1) {
      const x = toX(i);
      const y = toY(series.angles[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const baseIdx = clampDayIndex(baseDay, yearDays);
    const markerX = toX(baseIdx);
    const markerY = toY(series.angles[baseIdx]);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(markerX, markerY, 4, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(235,245,255,0.3)';
    ctx.fillStyle = 'rgba(235,245,255,0.8)';
    ctx.font = '12px Arial, sans-serif';

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 2; i += 1) {
      const val = minV + ((maxV - minV) * i) / 2;
      const y = toY(val);
      ctx.beginPath();
      ctx.moveTo(padding - 6, y);
      ctx.lineTo(padding, y);
      ctx.stroke();
      ctx.fillText(val.toFixed(3), padding - 8, y);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 2; i += 1) {
      const day = Math.round((yearDays - 1) * i / 2);
      const x = toX(day);
      ctx.beginPath();
      ctx.moveTo(x, padding + plotH);
      ctx.lineTo(x, padding + plotH + 6);
      ctx.stroke();
      ctx.fillText(String(day), x, padding + plotH + 10);
    }

    analemmaUi.charts.ecc.plot = {
      x0: padding,
      y0: padding,
      w: plotW,
      h: plotH,
      yearDays,
      minV,
      maxV
    };
  };
    const updateObliquityMiniValues = (container) => {
      const equinoxH = Math.cos(OBLIQUITY_RAD);
      const equinoxV = Math.sin(OBLIQUITY_RAD);
      const solsticeH = 1 / Math.cos(OBLIQUITY_RAD);
      const solsticeV = 0;
      const valueMap = {
        'equinox-h': equinoxH,
        'equinox-v': equinoxV,
        'solstice-h': solsticeH,
        'solstice-v': solsticeV
      };
      const valueEls = Array.from(container.querySelectorAll('.analemma-mini-value'));
      valueEls.forEach((el) => {
        const key = el.dataset.miniValue;
        const value = valueMap[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
          el.textContent = value.toFixed(2);
        }
      });
    };

    const renderObliquityMiniChartsFlat = (container) => {
      if (!container) return;
      const charts = Array.from(container.querySelectorAll('.analemma-mini-chart'));
      if (!charts.length) return;
      updateObliquityMiniValues(container);
      charts.forEach((canvas) => {
        canvas.classList.remove('analemma-mini-chart-curved');
        const mode = canvas.dataset.mini || 'equinox';
        const frame = canvas.closest('.analemma-mini-frame');
        const row = canvas.closest('.analemma-mini-row') || frame?.parentElement || canvas.parentElement;
        const block = canvas.closest('.analemma-mini-block') || row?.parentElement;
        const label = block?.querySelector('.analemma-mini-label');
        const blockStyles = block ? getComputedStyle(block) : null;
        const gapVal = blockStyles ? parseFloat(blockStyles.rowGap || blockStyles.gap || '0') : 0;
        const labelH = label ? label.getBoundingClientRect().height : 0;
        const blockW = block?.clientWidth || row?.clientWidth || canvas.clientWidth || (container.clientWidth ? container.clientWidth / 2 : 240);
        const blockH = block?.clientHeight || row?.clientHeight || blockW;
        const availableH = Math.max(60, Math.floor(blockH - labelH - gapVal));
        const canvasW = Math.max(120, Math.floor(frame?.getBoundingClientRect().width || canvas.getBoundingClientRect().width || blockW));
        const cssW = Math.max(120, Math.floor(canvasW));
        const cssH = Math.max(100, Math.min(Math.floor(cssW * 1.1), availableH));
        const dpr = setCanvasSize(canvas, cssW, cssH);
        canvas.style.height = `${cssH}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);
        const cx = cssW * 0.5;
        const cy = cssH * 0.5;
        const half = Math.min(cssW, cssH) * 0.36;
        const left = cx - half;
        const top = cy - half;
        const size = half * 2;
        ctx.strokeStyle = 'rgba(130,170,230,0.45)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(left, top, size, size);
        const tilt = OBLIQUITY_RAD;
        const eclipticY = mode === 'solstice' ? (cy - half * 0.45) : cy;
        const dir = mode === 'solstice'
          ? { x: 1, y: 0 }
          : { x: Math.cos(tilt), y: -Math.sin(tilt) };
        const stepLen = half * 0.6;
        const lonSpacing = mode === 'solstice' ? stepLen * 0.7 : stepLen * 1.25;
        const firstLonX = cx - lonSpacing * 0.5;
        const intersection = { x: firstLonX, y: cy };
        const lineDir = mode === 'solstice'
          ? { x: 1, y: 0 }
          : { x: dir.x, y: dir.y };
        const p1 = mode === 'equinox'
          ? {
              x: intersection.x,
              y: intersection.y
            }
          : {
              x: cx - lineDir.x * stepLen * 0.5,
              y: eclipticY - lineDir.y * stepLen * 0.5
            };
        const p2 = mode === 'equinox'
          ? {
              x: intersection.x + lineDir.x * stepLen,
              y: intersection.y + lineDir.y * stepLen
            }
          : {
              x: cx + lineDir.x * stepLen * 0.5,
              y: eclipticY + lineDir.y * stepLen * 0.5
            };
        if (mode === 'equinox') {
          ctx.strokeStyle = 'rgba(230,240,255,0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(left, cy);
          ctx.lineTo(left + size, cy);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(126,231,135,0.95)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([6, 4]);
        if (mode === 'equinox') {
          let tMin = -Infinity;
          let tMax = Infinity;
          if (Math.abs(lineDir.x) > 1e-6) {
            const tx1 = (left - p1.x) / lineDir.x;
            const tx2 = (left + size - p1.x) / lineDir.x;
            tMin = Math.max(tMin, Math.min(tx1, tx2));
            tMax = Math.min(tMax, Math.max(tx1, tx2));
          }
          if (Math.abs(lineDir.y) > 1e-6) {
            const ty1 = (top - p1.y) / lineDir.y;
            const ty2 = (top + size - p1.y) / lineDir.y;
            tMin = Math.max(tMin, Math.min(ty1, ty2));
            tMax = Math.min(tMax, Math.max(ty1, ty2));
          }
          const start = {
            x: p1.x + lineDir.x * tMin,
            y: p1.y + lineDir.y * tMin
          };
          const end = {
            x: p1.x + lineDir.x * tMax,
            y: p1.y + lineDir.y * tMax
          };
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(left, eclipticY);
          ctx.lineTo(left + size, eclipticY);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(126,231,135,1)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.fillStyle = 'rgba(126,231,135,1)';
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 2.6, 0, Math.PI * 2);
        ctx.arc(p2.x, p2.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        const projX1 = p1.x;
        const projX2 = p2.x;
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(projX1, p1.y);
        ctx.lineTo(projX1, cy);
        ctx.moveTo(projX2, p2.y);
        ctx.lineTo(projX2, cy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,214,85,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(projX1, cy);
        ctx.lineTo(projX2, cy);
        ctx.stroke();
        if (mode === 'equinox') {
          ctx.strokeStyle = 'rgba(120,200,255,0.7)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(projX2, cy);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,214,85,0.55)';
        ctx.lineWidth = 1;
        [-1, 1].forEach((dirX) => {
          const x = cx + dirX * lonSpacing * 0.5;
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + size);
          ctx.stroke();
        });
      });
    };

    const renderObliquityMiniChartsCurved = (container) => {
      if (!container) return;
      const charts = Array.from(container.querySelectorAll('.analemma-mini-chart'));
      if (!charts.length) return;
      updateObliquityMiniValues(container);
      const DEG2RAD = Math.PI / 180;
      const project = (latDeg, lonDeg) => {
        const lat = latDeg * DEG2RAD;
        const lon = lonDeg * DEG2RAD;
        const cosLat = Math.cos(lat);
        return {
          x: cosLat * Math.sin(lon),
          y: Math.sin(lat),
          z: cosLat * Math.cos(lon)
        };
      };
      const sampleBounds = (latMin, latMax, lonMin, lonMax) => {
        const steps = 36;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const pushPoint = (latDeg, lonDeg) => {
          const p = project(latDeg, lonDeg);
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        };
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const lon = lonMin + (lonMax - lonMin) * t;
          pushPoint(latMin, lon);
          pushPoint(latMax, lon);
          const lat = latMin + (latMax - latMin) * t;
          pushPoint(lat, lonMin);
          pushPoint(lat, lonMax);
        }
        return { minX, maxX, minY, maxY };
      };
      const pathAlongLat = (ctx, toPixel, latDeg, lonStart, lonEnd, steps) => {
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const lon = lonStart + (lonEnd - lonStart) * t;
          const p = toPixel(latDeg, lon);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
      };
      const pathAlongLon = (ctx, toPixel, lonDeg, latStart, latEnd, steps) => {
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const lat = latStart + (latEnd - latStart) * t;
          const p = toPixel(lat, lonDeg);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
      };
      const tracePatchBoundary = (ctx, toPixel, latMin, latMax, lonMin, lonMax, steps) => {
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const lon = lonMin + (lonMax - lonMin) * t;
          const p = toPixel(latMax, lon);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        for (let i = 1; i <= steps; i += 1) {
          const t = i / steps;
          const lat = latMax + (latMin - latMax) * t;
          const p = toPixel(lat, lonMax);
          ctx.lineTo(p.x, p.y);
        }
        for (let i = 1; i <= steps; i += 1) {
          const t = i / steps;
          const lon = lonMax + (lonMin - lonMax) * t;
          const p = toPixel(latMin, lon);
          ctx.lineTo(p.x, p.y);
        }
        for (let i = 1; i <= steps; i += 1) {
          const t = i / steps;
          const lat = latMin + (latMax - latMin) * t;
          const p = toPixel(lat, lonMin);
          ctx.lineTo(p.x, p.y);
        }
      };
      let equinoxSegmentPx = null;
      charts.forEach((canvas) => {
        canvas.classList.add('analemma-mini-chart-curved');
        const mode = canvas.dataset.mini || 'equinox';
        const frame = canvas.closest('.analemma-mini-frame');
        const row = canvas.closest('.analemma-mini-row') || frame?.parentElement || canvas.parentElement;
        const block = canvas.closest('.analemma-mini-block') || row?.parentElement;
        const label = block?.querySelector('.analemma-mini-label');
        const blockStyles = block ? getComputedStyle(block) : null;
        const gapVal = blockStyles ? parseFloat(blockStyles.rowGap || blockStyles.gap || '0') : 0;
        const labelH = label ? label.getBoundingClientRect().height : 0;
        const blockW = block?.clientWidth || row?.clientWidth || canvas.clientWidth || (container.clientWidth ? container.clientWidth / 2 : 240);
        const blockH = block?.clientHeight || row?.clientHeight || blockW;
        const availableH = Math.max(60, Math.floor(blockH - labelH - gapVal));
        const canvasW = Math.max(120, Math.floor(frame?.getBoundingClientRect().width || canvas.getBoundingClientRect().width || blockW));
        const cssW = Math.max(120, Math.floor(canvasW));
        const cssH = Math.max(110, Math.min(Math.floor(cssW * 1.1), availableH));
        const dpr = setCanvasSize(canvas, cssW, cssH);
        canvas.style.height = `${cssH}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        const tilt = OBLIQUITY_RAD;
        const degPerUnit = 14;
        const tiltDeg = tilt * 180 / Math.PI;
        const unitLonSpacing = mode === 'solstice' ? 0.7 : 1.25;
        const startLonUnits = -unitLonSpacing * 0.5;
        const unitSegment = 1;
        const dLonUnits = mode === 'solstice' ? (1 / Math.cos(tilt)) * unitSegment : Math.cos(tilt) * unitSegment;
        const dLatUnits = mode === 'solstice' ? 0 : Math.sin(tilt) * unitSegment;
        let lat0Units = mode === 'solstice' ? (tiltDeg / degPerUnit) : 0;
        const maxLonUnitsBase = Math.max(Math.abs(startLonUnits), Math.abs(startLonUnits + dLonUnits), Math.abs(unitLonSpacing * 0.5)) + 0.6;
        const equinoxUnitLonSpacing = 1.25;
        const equinoxStartLonUnits = -equinoxUnitLonSpacing * 0.5;
        const equinoxDLonUnits = Math.cos(tilt) * unitSegment;
        const equinoxDLatUnits = Math.sin(tilt) * unitSegment;
        const equinoxMaxLonUnits = Math.max(
          Math.abs(equinoxStartLonUnits),
          Math.abs(equinoxStartLonUnits + equinoxDLonUnits),
          Math.abs(equinoxUnitLonSpacing * 0.5)
        ) + 0.6;
        let equinoxLat0Units = 0;
        const equinoxSlope = equinoxDLatUnits / (equinoxDLonUnits || 1);
        for (let i = 0; i < 2; i += 1) {
          const endLat = equinoxLat0Units + equinoxDLatUnits;
          const maxLatUnitsGuess = Math.max(Math.abs(equinoxLat0Units), Math.abs(endLat)) + 0.6;
          const latMinUnitsGuess = -maxLatUnitsGuess;
          const latMaxUnitsGuess = maxLatUnitsGuess;
          const targetLonUnits = -equinoxMaxLonUnits + (equinoxMaxLonUnits * 2) / 3;
          const targetLatUnits = latMinUnitsGuess + (latMaxUnitsGuess - latMinUnitsGuess) / 3;
          equinoxLat0Units = targetLatUnits - equinoxSlope * (targetLonUnits - equinoxStartLonUnits);
        }
        const equinoxEndLat = equinoxLat0Units + equinoxDLatUnits;
        const equinoxMaxLatUnits = Math.max(Math.abs(equinoxLat0Units), Math.abs(equinoxEndLat)) + 0.6;
        if (mode === 'equinox') {
          let lat0Guess = 0;
          const lonMinUnits = -maxLonUnitsBase;
          const lonMaxUnits = maxLonUnitsBase;
          const slope = dLatUnits / (dLonUnits || 1);
          for (let i = 0; i < 2; i += 1) {
            const endLat = lat0Guess + dLatUnits;
            const maxLatUnitsGuess = Math.max(Math.abs(lat0Guess), Math.abs(endLat)) + 0.6;
            const latMinUnitsGuess = -maxLatUnitsGuess;
            const latMaxUnitsGuess = maxLatUnitsGuess;
            const targetLonUnits = lonMinUnits + (lonMaxUnits - lonMinUnits) / 3;
            const targetLatUnits = latMinUnitsGuess + (latMaxUnitsGuess - latMinUnitsGuess) / 3;
            lat0Guess = targetLatUnits - slope * (targetLonUnits - startLonUnits);
          }
          lat0Units = lat0Guess;
        }
        const startPoint = { lon: startLonUnits, lat: lat0Units };
        const endPoint = { lon: startLonUnits + dLonUnits, lat: lat0Units + dLatUnits };
        let maxLonUnits = maxLonUnitsBase;
        const maxLatUnits = Math.max(Math.abs(lat0Units), Math.abs(endPoint.lat)) + 0.6;
        let latMinUnits = -maxLatUnits;
        let latMaxUnits = maxLatUnits;
        if (mode === 'solstice') {
          const spanLatUnits = equinoxMaxLatUnits * 2;
          latMinUnits = lat0Units - spanLatUnits / 3;
          latMaxUnits = latMinUnits + spanLatUnits;
          maxLonUnits = equinoxMaxLonUnits;
        }
        const equinoxLonMin = -equinoxMaxLonUnits * degPerUnit;
        const equinoxLonMax = equinoxMaxLonUnits * degPerUnit;
        const equinoxLatMin = -equinoxMaxLatUnits * degPerUnit;
        const equinoxLatMax = equinoxMaxLatUnits * degPerUnit;
        const equinoxBounds = sampleBounds(equinoxLatMin, equinoxLatMax, equinoxLonMin, equinoxLonMax);
        const padding = Math.min(cssW, cssH) * 0.08;
        const equinoxSpanX = Math.max(1e-6, equinoxBounds.maxX - equinoxBounds.minX);
        const equinoxSpanY = Math.max(1e-6, equinoxBounds.maxY - equinoxBounds.minY);
        const equinoxScale = Math.min((cssW - padding * 2) / equinoxSpanX, (cssH - padding * 2) / equinoxSpanY);
        const equinoxBottomWidth = Math.abs(project(equinoxLatMin, equinoxLonMax).x - project(equinoxLatMin, equinoxLonMin).x) * equinoxScale;

        let lonMin = -maxLonUnits * degPerUnit;
        let lonMax = maxLonUnits * degPerUnit;
        const latMin = latMinUnits * degPerUnit;
        const latMax = latMaxUnits * degPerUnit;
        if (mode === 'solstice' && Number.isFinite(equinoxBottomWidth)) {
          const computeBottomWidth = (scaleFactor) => {
            const testLonMin = lonMin * scaleFactor;
            const testLonMax = lonMax * scaleFactor;
            const testBounds = sampleBounds(latMin, latMax, testLonMin, testLonMax);
            const spanX = Math.max(1e-6, testBounds.maxX - testBounds.minX);
            const spanY = Math.max(1e-6, testBounds.maxY - testBounds.minY);
            const scale = Math.min((cssW - padding * 2) / spanX, (cssH - padding * 2) / spanY);
            const widthNorm = Math.abs(project(latMin, testLonMax).x - project(latMin, testLonMin).x);
            return widthNorm * scale;
          };
          let low = 0.6;
          let high = 1.4;
          let widthHigh = computeBottomWidth(high);
          for (let i = 0; i < 6 && widthHigh < equinoxBottomWidth; i += 1) {
            high *= 1.2;
            widthHigh = computeBottomWidth(high);
          }
          for (let i = 0; i < 10; i += 1) {
            const mid = (low + high) * 0.5;
            const widthMid = computeBottomWidth(mid);
            if (widthMid > equinoxBottomWidth) {
              high = mid;
            } else {
              low = mid;
            }
          }
          const finalScale = (low + high) * 0.5;
          lonMin *= finalScale;
          lonMax *= finalScale;
        }
        const baseLatDeg = mode === 'equinox'
          ? latMin + (latMax - latMin) / 3
          : 0;

        const bounds = sampleBounds(latMin, latMax, lonMin, lonMax);
        const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
        const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
        const scale = Math.min((cssW - padding * 2) / spanX, (cssH - padding * 2) / spanY);
        const cx = cssW * 0.5;
        const cy = cssH * 0.52;
        const x0 = (bounds.minX + bounds.maxX) * 0.5;
        const y0 = (bounds.minY + bounds.maxY) * 0.5;
        const toPixel = (latDeg, lonDeg) => {
          const p = project(latDeg, lonDeg);
          return {
            x: cx + (p.x - x0) * scale,
            y: cy - (p.y - y0) * scale
          };
        };
        ctx.save();
        ctx.beginPath();
        tracePatchBoundary(ctx, toPixel, latMin, latMax, lonMin, lonMax, 70);
        ctx.closePath();
        ctx.clip();

        const latFractions = [1 / 3, 2 / 3];
        const baseLonFraction = 1 / 3;
        const lonFractions = [baseLonFraction, baseLonFraction * 2];
        if (mode === 'solstice') {
          const lonCompression = Math.cos(lat0Units * degPerUnit * DEG2RAD) * 0.9;
          const extraLon = baseLonFraction * 2 + baseLonFraction * lonCompression;
          if (extraLon < 0.98) lonFractions.push(extraLon);
        }
        ctx.strokeStyle = 'rgba(170,200,255,0.32)';
        ctx.lineWidth = 1;
        latFractions.forEach((fraction) => {
          const lat = latMin + (latMax - latMin) * fraction;
          if (Math.abs(lat) < 1e-4) return;
          ctx.beginPath();
          pathAlongLat(ctx, toPixel, lat, lonMin, lonMax, 60);
          ctx.stroke();
        });
        lonFractions.forEach((fraction) => {
          const lon = lonMin + (lonMax - lonMin) * fraction;
          ctx.beginPath();
          pathAlongLon(ctx, toPixel, lon, latMin, latMax, 60);
          ctx.stroke();
        });

        ctx.strokeStyle = 'rgba(230,240,255,0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        pathAlongLat(ctx, toPixel, baseLatDeg, lonMin, lonMax, 60);
        ctx.stroke();


        const eclipticLinePoints = [];
        if (mode === 'equinox') {
          for (let i = -80; i <= 80; i += 1) {
            const t = i / 20;
            const lonUnits = startLonUnits + dLonUnits * t;
            const latUnits = lat0Units + dLatUnits * t;
            if (lonUnits < -maxLonUnits || lonUnits > maxLonUnits || latUnits < -maxLatUnits || latUnits > maxLatUnits) {
              continue;
            }
            eclipticLinePoints.push({ lat: latUnits * degPerUnit, lon: lonUnits * degPerUnit });
          }
        } else {
          for (let i = 0; i <= 60; i += 1) {
            const t = i / 60;
            const lonUnits = -maxLonUnits + (maxLonUnits * 2) * t;
            const baseLat = lat0Units * degPerUnit;
            eclipticLinePoints.push({ lat: baseLat, lon: lonUnits * degPerUnit, t });
          }
        }
        if (eclipticLinePoints.length > 1) {
          ctx.strokeStyle = 'rgba(126,231,135,1)';
          ctx.lineWidth = mode === 'solstice' ? 1.8 : 1.5;
          ctx.setLineDash(mode === 'solstice' ? [5, 4] : [6, 4]);
          ctx.beginPath();
          eclipticLinePoints.forEach((pt, idx) => {
            const p = toPixel(pt.lat, pt.lon);
            if (mode === 'solstice' && typeof pt.t === 'number') {
              const bendPx = 5;
              const curveOffset = bendPx * Math.pow(2 * pt.t - 1, 2);
              p.y += curveOffset;
            }
            if (idx === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();
          ctx.setLineDash([]);
        }

        const lonMinUnits = lonMin / degPerUnit;
        const lonMaxUnits = lonMax / degPerUnit;
        const latMinUnitsGrid = latMin / degPerUnit;
        const latMaxUnitsGrid = latMax / degPerUnit;
        const cellLonUnits = (lonMaxUnits - lonMinUnits) / 3;
        const cellLatUnits = (latMaxUnitsGrid - latMinUnitsGrid) / 3;
        const segmentStartUnits = { lon: lonMinUnits + cellLonUnits, lat: latMinUnitsGrid + cellLatUnits };
        const segDirUnits = mode === 'solstice'
          ? { x: 1, y: 0 }
          : { x: dLonUnits, y: dLatUnits };
        const segLen = Math.hypot(segDirUnits.x, segDirUnits.y) || 1;
        const segDirNorm = { x: segDirUnits.x / segLen, y: segDirUnits.y / segLen };
        let segmentLengthUnits = cellLonUnits;
        if (mode === 'solstice' && equinoxSegmentPx) {
          const unitStep = 1;
          const unitEnd = {
            lon: segmentStartUnits.lon + segDirNorm.x * unitStep,
            lat: segmentStartUnits.lat + segDirNorm.y * unitStep
          };
          const unitStartPx = toPixel(segmentStartUnits.lat * degPerUnit, segmentStartUnits.lon * degPerUnit);
          const unitEndPx = toPixel(unitEnd.lat * degPerUnit, unitEnd.lon * degPerUnit);
          const unitPxLen = Math.hypot(unitEndPx.x - unitStartPx.x, unitEndPx.y - unitStartPx.y) || 1;
          segmentLengthUnits = equinoxSegmentPx / unitPxLen;
        }
        const segmentEndUnits = {
          lon: segmentStartUnits.lon + segDirNorm.x * segmentLengthUnits,
          lat: segmentStartUnits.lat + segDirNorm.y * segmentLengthUnits
        };
        const p1Deg = { lat: segmentStartUnits.lat * degPerUnit, lon: segmentStartUnits.lon * degPerUnit };
        const p2Deg = { lat: segmentEndUnits.lat * degPerUnit, lon: segmentEndUnits.lon * degPerUnit };
        const p1 = toPixel(p1Deg.lat, p1Deg.lon);
        const p2 = toPixel(p2Deg.lat, p2Deg.lon);
        if (mode === 'equinox') {
          equinoxSegmentPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        }
        ctx.strokeStyle = 'rgba(126,231,135,1)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.fillStyle = 'rgba(126,231,135,1)';
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 2.6, 0, TAU);
        ctx.arc(p2.x, p2.y, 2.6, 0, TAU);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        pathAlongLon(ctx, toPixel, p1Deg.lon, baseLatDeg, p1Deg.lat, 24);
        pathAlongLon(ctx, toPixel, p2Deg.lon, baseLatDeg, p2Deg.lat, 24);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,214,85,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        pathAlongLat(ctx, toPixel, baseLatDeg, p1Deg.lon, p2Deg.lon, 40);
        ctx.stroke();
        if (mode === 'equinox') {
          ctx.strokeStyle = 'rgba(120,200,255,0.7)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          pathAlongLon(ctx, toPixel, p2Deg.lon, baseLatDeg, p2Deg.lat, 24);
          ctx.stroke();
        }

        ctx.restore();
        ctx.strokeStyle = 'rgba(130,170,230,0.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        tracePatchBoundary(ctx, toPixel, latMin, latMax, lonMin, lonMax, 70);
        ctx.closePath();
        ctx.stroke();
      });
    };
    const renderObliquityDiagram = (canvas, series, baseDay) => {
    if (!canvas || !series) return;
    const parentW = canvas.parentElement?.clientWidth || 520;
    const cssW = Math.max(260, Math.floor(parentW));
    const maxH = analemmaUi.chartHeights?.obliq ?? Infinity;
      const cssH = Math.min(Math.round(cssW * 0.92), maxH);
      const dpr = setCanvasSize(canvas, cssW, cssH);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
        const obliqCard = canvas.closest('.analemma-card');
        const obliqSpacer = obliqCard?.querySelector('.analemma-card-spacer');
        if (obliqSpacer) {
          const spacerHeight = Math.round(cssH * 1.4);
          obliqSpacer.style.height = `${spacerHeight}px`;
          const useCurvedMiniCharts = true;
          if (useCurvedMiniCharts) {
            renderObliquityMiniChartsCurved(obliqSpacer);
          } else {
            renderObliquityMiniChartsFlat(obliqSpacer);
          }
        }

    const padding = 48;
    const plotW = cssW - padding * 2;
    const plotH = cssH - padding * 2;
    const minV = series.minV;
    const maxV = series.maxV;
    const yearDays = series.factors.length;
    const scaleY = plotH / (maxV - minV || 1);
    const toX = (day) => padding + (day / (yearDays - 1)) * plotW;
    const toY = (v) => padding + (maxV - v) * scaleY;

    ctx.strokeStyle = 'rgba(150,200,255,0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + plotH);
    ctx.lineTo(padding + plotW, padding + plotH);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,214,85,0.4)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 4]);
    const baseLineY = toY(1);
    ctx.beginPath();
    ctx.moveTo(padding, baseLineY);
    ctx.lineTo(padding + plotW, baseLineY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(126,231,135,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < yearDays; i += 1) {
      const x = toX(i);
      const y = toY(series.factors[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const baseIdx = clampDayIndex(baseDay, yearDays);
    const markerX = toX(baseIdx);
    const markerY = toY(series.factors[baseIdx]);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(markerX, markerY, 4, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(235,245,255,0.3)';
    ctx.fillStyle = 'rgba(235,245,255,0.8)';
    ctx.font = '12px Arial, sans-serif';

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 2; i += 1) {
      const val = minV + ((maxV - minV) * i) / 2;
      const y = toY(val);
      ctx.beginPath();
      ctx.moveTo(padding - 6, y);
      ctx.lineTo(padding, y);
      ctx.stroke();
      ctx.fillText(val.toFixed(3), padding - 8, y);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 2; i += 1) {
      const day = Math.round((yearDays - 1) * i / 2);
      const x = toX(day);
      ctx.beginPath();
      ctx.moveTo(x, padding + plotH);
      ctx.lineTo(x, padding + plotH + 6);
      ctx.stroke();
      ctx.fillText(String(day), x, padding + plotH + 10);
    }

    analemmaUi.charts.obliq.plot = {
      x0: padding,
      y0: padding,
      w: plotW,
      h: plotH,
      yearDays,
      minV,
      maxV
    };
  };
  const renderAnalemmaCombinedChart = (canvas, data) => {
    if (!canvas || !data?.series) return;
    const { series, baseDay, orbitalMotion, lonCompression, combined, tiltFactor, nextNoonDeltaSeconds } = data;
    const { combinedSeconds = [], yearDays = 365 } = series;
    const chartSeconds = combinedSeconds.map((value) => (Number.isFinite(value) ? -value : value));
    const parentW = canvas.parentElement?.clientWidth || 320;
    const cssW = Math.max(240, Math.floor(parentW));
    const cssH = 240;
    const dpr = setCanvasSize(canvas, cssW, cssH);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const padding = 18;
    const axisSpacing = 32;
    const closingMargin = 4;
    const leftMargin = padding + axisSpacing;
    const plotW = Math.max(80, cssW - leftMargin - padding - closingMargin);
    const plotH = cssH - 60;
    const plotTop = 44;
    const midY = plotTop + plotH / 2;
    let maxAbsSeconds = 0;
    chartSeconds.forEach((value) => {
      if (Number.isFinite(value)) maxAbsSeconds = Math.max(maxAbsSeconds, Math.abs(value));
    });
    maxAbsSeconds = Math.max(maxAbsSeconds, 0.5);
    const maxAbsMinutes = maxAbsSeconds / 60;
    const tickStepMinutes = 3;
    const tickMaxMinutes = Math.max(tickStepMinutes, Math.ceil(maxAbsMinutes / tickStepMinutes) * tickStepMinutes);
    const scale = Math.max(0.0001, tickMaxMinutes * 60);

    ctx.fillStyle = 'rgba(8,12,18,0.9)';
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.fillStyle = 'rgba(220,230,255,0.75)';
    ctx.font = '12px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(copyText('eotChartTitle', 'Equation of time'), padding, 22);

    const axisColor = 'rgba(255,255,255,0.3)';
    const axisX = leftMargin;
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(axisX, plotTop - 4);
    ctx.lineTo(axisX, plotTop + plotH + 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(axisX, midY);
    ctx.lineTo(leftMargin + plotW, midY);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '10px Arial, sans-serif';
    ctx.fillStyle = 'rgba(220,230,255,0.7)';
    ctx.fillText(copyText('chartMinutesUnit', 'min'), axisX - 6, plotTop - 6);

    const toX = (day) => leftMargin + (plotW * day) / Math.max(1, yearDays - 1);
    const toY = (value) => midY - (value / scale) * (plotH / 2);
    const labelDigits = 0;
    const axisTickColor = 'rgba(220,230,255,0.35)';
    ctx.strokeStyle = axisTickColor;
    ctx.fillStyle = 'rgba(220,230,255,0.7)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let minutes = -tickMaxMinutes; minutes <= tickMaxMinutes; minutes += tickStepMinutes) {
      const value = minutes * 60;
      const y = toY(value);
      ctx.beginPath();
      ctx.moveTo(axisX - 4, y);
      ctx.lineTo(axisX, y);
      ctx.stroke();
      ctx.fillText(minutes.toFixed(labelDigits), axisX - 8, y);
    }
    const drawLine = (values, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      values.forEach((value, index) => {
        if (typeof value !== 'number') return;
        const x = toX(index);
        const y = toY(value);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    drawLine(chartSeconds, '#ffd655');

    if (typeof baseDay === 'number' && baseDay >= 0 && baseDay < yearDays) {
      const highlightX = toX(baseDay);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(highlightX, plotTop);
      ctx.lineTo(highlightX, plotTop + plotH);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '10px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(copyText('chartTodayLabel', 'Today'), highlightX + 4, plotTop + 4);
    }

    ctx.fillStyle = 'rgba(220,230,255,0.6)';
    ctx.font = '10px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('+', cssW - padding - 10, plotTop + 4);
    ctx.fillText('-', cssW - padding - 10, plotTop + plotH - 4);
  };

  const updateAnalemmaChartHeights = () => {
    if (!isAnalemmaPage) return;
    const breakdown = document.getElementById('analemmaBreakdown');
    const controls = document.getElementById('analemmaControls');
    const componentsPanel = breakdown?.querySelector('.analemma-tab-panel[data-tab="components"]');
    if (!breakdown || !componentsPanel || !componentsPanel.classList.contains('active')) return;
    const cardsContainer = componentsPanel.querySelector('.analemma-cards');
    const cards = Array.from(componentsPanel.querySelectorAll('.analemma-card'));
    if (!cardsContainer || !cards.length) return;
    const top = breakdown.getBoundingClientRect().top;
    const available = window.innerHeight - top - 12;
    const controlsH = controls?.getBoundingClientRect().height ?? 0;
    const gapStr = getComputedStyle(cardsContainer).rowGap || getComputedStyle(cardsContainer).gap || '0';
    const gapVal = parseFloat(gapStr) || 0;
    const cardsGap = gapVal * Math.max(0, cards.length - 1);
    const cardsMarginTop = parseFloat(getComputedStyle(cardsContainer).marginTop || '0') || 0;
      const staticHeights = cards.map((card) => {
        const chart = card.querySelector('.analemma-card-chart');
        if (!chart) return 0;
        const cardRect = card.getBoundingClientRect();
        const chartRect = chart.getBoundingClientRect();
        const spacer = card.querySelector('.analemma-card-spacer');
        const spacerRect = spacer?.getBoundingClientRect();
        const spacerHeight = spacerRect ? spacerRect.height : 0;
        return Math.max(0, cardRect.height - chartRect.height - spacerHeight);
      });
    const totalStatic = staticHeights.reduce((sum, val) => sum + val, 0);
    const availableForCharts = Math.max(0, available - controlsH - cardsGap - cardsMarginTop - totalStatic);
    const weights = [1, 1];
    const weightSum = weights.reduce((sum, val) => sum + val, 0) || 1;
    const base = availableForCharts / weightSum;
    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
      analemmaUi.chartHeights = {
        ecc: clamp(base * weights[0], 60, 220),
        obliq: clamp(base * weights[1], 60, 220)
      };
  };
  const updateAnalemmaReadouts = (seriesEcc, seriesObliq, baseDay) => {
    if (!seriesEcc || !seriesObliq) return;
    const yearDays = seriesEcc.angles.length;
    const baseIdx = clampDayIndex(baseDay, yearDays);
    const eccValue = seriesEcc.angles[baseIdx];
    const obliqValue = seriesObliq.factors[baseIdx];

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    setText('eccKeyValue', `${eccValue.toFixed(4)} deg`);
    setText('obliqKeyValue', `${obliqValue.toFixed(4)} deg/deg`);
  };
  const updateAnalemmaPanels = (date, sun, meanSun) => {
    if (!isAnalemmaPage) return;
    updateAnalemmaChartHeights();
    const componentsPanel = document.querySelector('.analemma-tab-panel[data-tab="components"]');
    if (componentsPanel && !componentsPanel.classList.contains('active')) return;
    const eccCanvas = analemmaUi.charts.ecc.canvas;
    const obliqCanvas = analemmaUi.charts.obliq.canvas;
    if (!eccCanvas || !obliqCanvas) return;
    const { date: baseDate, baseDay, yearDays } = updateEccentricityBaseDate(date);
    const year = baseDate.getUTCFullYear();
    ensureAnalemmaCache(year, yearDays);
    const eccSeries = analemmaUi.cache.ecc;
    const obliqSeries = analemmaUi.cache.obliq;
    analemmaUi.charts.ecc.data = { ...eccSeries, year, baseDay };
    analemmaUi.charts.obliq.data = { ...obliqSeries, year, baseDay };

    renderEccentricityChart(eccCanvas, eccSeries, baseDay);
    renderObliquityDiagram(obliqCanvas, obliqSeries, baseDay);
    updateAnalemmaReadouts(eccSeries, obliqSeries, baseDay);
  };
  const getTooltipLines = (type, localX, localY) => {
    if (type === 'ecc') {
      const chart = analemmaUi.charts.ecc;
      if (!chart.data || !chart.plot) return null;
      const { x0, y0, w, h, yearDays } = chart.plot;
      if (localX < x0 || localX > x0 + w || localY < y0 || localY > y0 + h) return null;
      const day = clampDayIndex(((localX - x0) / w) * (yearDays - 1), yearDays);
      const date = getDateForDay(chart.data.year, day);
      const angle = chart.data.angles[day];
      const delta = angle - chart.data.meanExtraDeg;
      return [
        formatCopy('tooltipDate', 'Date: {value}', { value: formatIsoDate(date) }),
        formatCopy('tooltipExtraAngle', 'Extra angle: {value}', { value: `${angle.toFixed(4)} deg` }),
        formatCopy('tooltipDeltaMean', 'Delta vs mean: {value}', { value: `${delta.toFixed(4)} deg` })
      ];
    }
    if (type === 'obliq') {
      const chart = analemmaUi.charts.obliq;
      if (!chart.data || !chart.plot) return null;
      const { x0, y0, w, h, yearDays } = chart.plot;
      if (localX < x0 || localX > x0 + w || localY < y0 || localY > y0 + h) return null;
      const day = clampDayIndex(((localX - x0) / w) * (yearDays - 1), yearDays);
      const date = getDateForDay(chart.data.year, day);
      const factor = chart.data.factors[day];
      return [
        formatCopy('tooltipDate', 'Date: {value}', { value: formatIsoDate(date) }),
        formatCopy('tooltipTiltFactor', 'Tilt factor: {value}', { value: `${factor.toFixed(4)} deg/deg` })
      ];
    }
    return null;
  };

  return {
    updateEccentricityBaseDate,
    ensureAnalemmaCache,
    renderAnalemmaCombinedChart,
    updateAnalemmaChartHeights,
    updateAnalemmaReadouts,
    updateAnalemmaPanels,
    getTooltipLines,
    formatAbsMinSec,
    formatNextNoonLabel,
    clampDayIndex
  };
};
