import {
  TAU,
  SIDEREAL_MS,
  daysInYear,
  pad2,
  normalizeDeg,
  wrap360,
  OBLIQUITY_RAD,
  alignMeanRealNearEotZero,
  sunEclipticLonDeg,
  meanSunSubpoint,
  getSubpoints
} from './astroCore.js';
import { createAnalemmaPath, createAnalemmaTooltip } from './earthAnalemmaPath.js';
import { createAnalemmaCharts } from './earthAnalemmaCharts.js';
import { createAnalemmaUI } from './earthAnalemmaUI.js';

const api = (typeof window !== 'undefined') ? window.earthViewerApi : null;
const isAnalemmaPage = document.body?.classList.contains('analemma-page');
if (!api || !isAnalemmaPage) {
  if (!api) console.warn('earthAnalemmaPage: earthViewerApi not available.');
} else {
  const uiDir = document.documentElement.dir || 'ltr';
  if (api.controls && Number.isFinite(api.baseCameraDistance)) {
    api.controls.enableZoom = false;
    api.controls.minDistance = api.baseCameraDistance;
    api.controls.maxDistance = api.baseCameraDistance;
  }
  const analemmaInsetState = { enabled: false, mode: 'sidereal' };
  const analemmaUi = {
    tab: null,
    cache: null,
    chartHeights: null,
    charts: {
      ecc: { canvas: null, plot: null, data: null },
      obliq: { canvas: null, plot: null, data: null },
      combined: { canvas: null, plot: null, data: null }
    },
    tooltip: { el: null, pinned: false, source: null }
  };
  let analemmaTooltip = null;

  const hideAnalemmaInset = () => {
    const box = document.getElementById('analemmaInsetBox');
    if (!box) return;
    box.style.display = 'none';
    box.style.visibility = '';
  };

  const analemmaPath = createAnalemmaPath({
    getSubpoints,
    latLonToVec3: api.latLonToVec3,
    tourHighlightGroup: api.groups.tourHighlightGroup,
    getTimeOverride: api.getTimeOverride,
    getDateTimeValue: () => document.getElementById('datetime')?.value,
    parseUTC: api.parseUTC
  });

  const analemmaCharts = createAnalemmaCharts({
    analemmaUi,
    isAnalemmaPage,
    copyText: api.copyText,
    formatCopy: api.formatCopy,
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
    getDateTimeValue: () => document.getElementById('datetime')?.value,
    parseUTC: api.parseUTC
  });
  const {
    updateEccentricityBaseDate,
    ensureAnalemmaCache,
    renderAnalemmaCombinedChart,
    updateAnalemmaChartHeights,
    updateAnalemmaPanels,
    getTooltipLines,
    formatAbsMinSec,
    formatNextNoonLabel,
    clampDayIndex
  } = analemmaCharts;

  analemmaTooltip = createAnalemmaTooltip({
    tooltip: analemmaUi.tooltip,
    getTooltipLines
  });

  const roundToMinute = (date) => new Date(Math.round(date.getTime() / 60000) * 60000);

  const startAnalemmaPlayback = (resume = false) => {
    api.stopTimePlayback?.();
    if (api.setCameraMode) {
      api.setCameraMode('sun');
    }
    const poi = { lat: 0, lon: 0 };
    api.setPoint(0, poi.lat, poi.lon);
    let baseDate = api.getTimeOverride?.()
      ?? (api.parseUTC(document.getElementById('datetime')?.value) ?? new Date());
    if (!resume || !analemmaPath.obliquityTrace.startDate) {
      analemmaPath.clearAnalemmaTrace();
      const startDate = alignMeanRealNearEotZero(poi.lon);
      analemmaPath.obliquityTrace.startDate = startDate;
      const endDate = new Date(startDate);
      endDate.setUTCFullYear(endDate.getUTCFullYear() + 1);
      analemmaPath.obliquityTrace.timespanMs = endDate.getTime() - startDate.getTime();
      baseDate = startDate;
    }
    const traceStart = analemmaPath.obliquityTrace.startDate;
    const endDate = new Date(traceStart);
    endDate.setUTCFullYear(endDate.getUTCFullYear() + 1);
    if (baseDate < traceStart || baseDate > endDate) baseDate = traceStart;
    const timespanMs = Math.max(0, endDate.getTime() - baseDate.getTime());
    analemmaPath.obliquityTrace.enabled = true;
    api.setTimeOverride?.(baseDate);
    document.getElementById('datetime').value = api.formatUTC(roundToMinute(baseDate));
    api.startTimePlayback?.({
      baseDate,
      timespanMs,
      durationMs: 45000,
      stepMs: 86400000
    });
    api.updateCelestial();
    if (api.setCameraMode) {
      api.setCameraMode('geo');
    }
  };

  const pauseAnalemmaPlayback = () => {
    const playback = api.getTimePlayback?.();
    if (!playback?.active) return;
    const current = api.getTimeOverride?.()
      ?? (api.parseUTC(document.getElementById('datetime')?.value) ?? new Date());
    api.stopTimePlayback?.({ preserveOverride: true, finalDate: current });
    api.updateCelestial();
  };

  const resetAnalemmaPlayback = () => {
    api.stopTimePlayback?.();
    analemmaPath.clearAnalemmaTrace();
    analemmaPath.obliquityTrace.enabled = false;
    analemmaPath.obliquityTrace.startDate = null;
    analemmaPath.obliquityTrace.timespanMs = 0;
    const poi = { lat: 0, lon: 0 };
    api.setPoint(0, poi.lat, poi.lon);
    const baseDate = alignMeanRealNearEotZero(poi.lon);
    api.setTimeOverride?.(baseDate);
    document.getElementById('datetime').value = api.formatUTC(roundToMinute(baseDate));
    api.updateCelestial();
  };

  const analemmaUiController = createAnalemmaUI({
    analemmaUi,
    analemmaInsetState,
    analemmaTooltip,
    analemmaPath,
    updateAnalemmaChartHeights,
    updateCelestial: api.updateCelestial,
    updateAnalemmaInset,
    hideAnalemmaInset,
    startAnalemmaPlayback,
    pauseAnalemmaPlayback,
    resetAnalemmaPlayback,
    getLastSubpoints: api.getLastSubpoints
  });

  const { initAnalemmaBreakdown } = analemmaUiController;

  function updateAnalemmaInset(mode, sun, meanSun) {
    const box = document.getElementById('analemmaInsetBox');
    const canvas = document.getElementById('analemmaInset');
    if (!box || !canvas) return;
    const showInset = isAnalemmaPage && analemmaInsetState.enabled && typeof mode === 'string';
    if (!showInset || !sun) {
      hideAnalemmaInset();
      return;
    }
    const t0 = api.getTimeOverride?.()
      ?? (api.parseUTC(document.getElementById('datetime')?.value) ?? new Date());
    const meanSunBase = meanSun || meanSunSubpoint(t0);
    if (!meanSunBase) {
      hideAnalemmaInset();
      return;
    }
    const t1 = new Date(t0.getTime() + SIDEREAL_MS);
    const sun1 = getSubpoints(t1, false)?.sun;
    if (!sun1) {
      hideAnalemmaInset();
      return;
    }
    const meanSun1 = meanSunSubpoint(t1);
    if (!meanSun1) {
      hideAnalemmaInset();
      return;
    }
    const insetMode = mode;

    const wasHidden = getComputedStyle(box).display === 'none';
    if (wasHidden) {
      box.style.display = 'block';
      box.style.visibility = 'hidden';
    }
    const boxStyles = getComputedStyle(box);
    const padX = parseFloat(boxStyles.paddingLeft || '0') + parseFloat(boxStyles.paddingRight || '0');
    const availableW = Math.max(360, Math.round((box.clientWidth || 780) - padX));
    const cssW = Math.min(900, availableW);
    const baseHeight = Math.max(320, Math.round(cssW * 0.75));
    const maxHeight = 780;
    const baseGap = 12;
    const gap = 32;
    const baseCssH = Math.min(Math.round(baseHeight * 1.5), maxHeight);
    const cssH = baseCssH + Math.max(0, gap - baseGap);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      hideAnalemmaInset();
      return;
    }
    box.style.display = 'block';
    box.style.visibility = '';

    const captionEl = document.getElementById('analemmaInsetCaption');
    if (captionEl) {
      const caption = insetMode === 'obliquity'
        ? box.dataset.captionObliquity
        : box.dataset.captionSidereal;
      captionEl.textContent = caption || '';
      captionEl.dir = uiDir;
    }

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const needW = Math.round(cssW * dpr);
    const needH = Math.round(cssH * dpr);
    if (canvas.width !== needW) canvas.width = needW;
    if (canvas.height !== needH) canvas.height = needH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.direction = uiDir;

    const fmtSignedDeg = (deg, digits = 3) => {
      const sign = deg < 0 ? '-' : '+';
      return `${sign}${Math.abs(deg).toFixed(digits)}\u00B0`;
    };
    const drawDot = (x, y, color, r = 6) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    };
    const drawArrow = (x0, y0, x1, y1, color, width = 4) => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const head = 10;
      const wing = 6;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash([]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - ux * head - uy * wing, y1 - uy * head + ux * wing);
      ctx.lineTo(x1 - ux * head + uy * wing, y1 - uy * head - ux * wing);
      ctx.closePath();
      ctx.fill();
      ctx.lineCap = 'butt';
    };
    const drawGuide = (x0, y0, x1, y1) => {
      ctx.strokeStyle = 'rgba(220,230,255,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const padding = 0;
    const textPadding = 6;
    const axisPadding = 18;
    const panelAvailable = Math.max(0, cssH - gap);
    const panelH = Math.max(180, Math.floor(panelAvailable / 2));
    const topPanelH = panelH + Math.max(0, panelAvailable - panelH * 2);
    const bottomPanelH = panelH;
    const topPanelY = 0;
    const bottomPanelY = topPanelY + topPanelH + gap;
    const axisLeft = padding;
    const axisRight = cssW - padding;
    const axisStart = axisLeft + axisPadding;
    const axisMargin = 12;
    const axisWidth = Math.max(40, axisRight - axisStart - axisMargin);
    const pxPerDeg = axisWidth / 2;
    const axisMid = axisStart + axisWidth / 2;
    const axisEnd = axisStart + axisWidth;
    const topMidY = topPanelY + topPanelH / 2;
    const bottomMidY = bottomPanelY + bottomPanelH / 2;

    const realDeltaLon = normalizeDeg(sun1.lon - sun.lon);
    const realDeltaLat = sun1.lat - sun.lat;
    const meanDeltaLon = normalizeDeg(meanSun1.lon - meanSunBase.lon);
    const tiltFactor = Math.cos(sun.lat * Math.PI / 180);
    const topScaleX = Math.max(0.001, pxPerDeg * tiltFactor);
    const lambda0 = sunEclipticLonDeg(t0);
    const lambda1 = sunEclipticLonDeg(t1);
    const deltaLambda = normalizeDeg(lambda1 - lambda0);
    const radToDeg = 180 / Math.PI;
    const l0 = lambda0 * Math.PI / 180;
    const l1 = (lambda0 + 1) * Math.PI / 180;
    const cosEps = Math.cos(OBLIQUITY_RAD);
    const ra0 = wrap360(Math.atan2(Math.sin(l0) * cosEps, Math.cos(l0)) * radToDeg);
    const ra1 = wrap360(Math.atan2(Math.sin(l1) * cosEps, Math.cos(l1)) * radToDeg);
    const lonCompression = Math.abs(normalizeDeg(ra1 - ra0));
    const orbitalMotion = Math.abs(deltaLambda);
    const combined = orbitalMotion * lonCompression;

    const nextNoonDeltaSeconds = (meanDeltaLon - realDeltaLon) * 240;
    const { date: insetDate, baseDay: insetBaseDay, yearDays: insetYearDays } = updateEccentricityBaseDate(t0);
    ensureAnalemmaCache(insetDate.getUTCFullYear(), insetYearDays);
    const combinedSeriesData = analemmaUi.cache?.combined;
    const combinedData = {
      series: combinedSeriesData,
      baseDay: insetBaseDay,
      orbitalMotion,
      lonCompression,
      combined,
      tiltFactor,
      nextNoonDeltaSeconds
    };
    if (analemmaUi.charts.combined.canvas) {
      renderAnalemmaCombinedChart(analemmaUi.charts.combined.canvas, combinedData);
    }

    const combinedCache = analemmaUi.cache?.combined;
    const baseIdxCombined = (combinedCache && Number.isFinite(insetBaseDay))
      ? clampDayIndex(insetBaseDay, combinedCache.yearDays ?? 365)
      : 0;
    const eotAccumSeconds = combinedCache?.combinedSeconds?.[baseIdxCombined] ?? 0;
    const setInspectorText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    const formatSignedSeconds = (seconds) => {
      if (!Number.isFinite(seconds)) return 'n/a';
      const sign = seconds < 0 ? '-' : '+';
      return `${sign}${formatAbsMinSec(seconds)}`;
    };
    const eotText = formatNextNoonLabel(eotAccumSeconds);
    const rawTimeDiffText = formatSignedSeconds(nextNoonDeltaSeconds);
    const timeDiffText = api.formatCopy('analemmaDailyDifference', 'Daily difference: {value}', { value: rawTimeDiffText });
    const inspectorDetailText = '';
    const meanMotionDeg = 360 / 365.25;
    const eccContribution = deltaLambda - meanMotionDeg;
    const dailyDifferenceDeg = meanMotionDeg - (meanMotionDeg + eccContribution) * lonCompression;
    const dailyDifferenceSec = dailyDifferenceDeg * 240;
    const formatContribution = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(4)}\u00B0`;
    const formatFactor = (value) => (Number.isFinite(value) ? `${value.toFixed(4)}x` : 'n/a');
    const eccText = formatContribution(eccContribution);
    const compressionText = formatFactor(lonCompression);
    const differenceDegText = formatContribution(dailyDifferenceDeg);
    const differenceSecText = formatSignedSeconds(dailyDifferenceSec);
    const eotLabel = api.copyText('eotShortLabel', 'EoT');
    setInspectorText('analemmaEoTValue', api.formatCopy('analemmaEotValue', '{label} = {value}', { label: eotLabel, value: eotText }));
    setInspectorText('analemmaEoTDelta', timeDiffText);
    setInspectorText('analemmaEoTDetail', inspectorDetailText);
    setInspectorText('analemmaInspectorEcc', api.formatCopy('analemmaInspectorEcc', 'Ecc {value}', { value: eccText }));
    setInspectorText('analemmaInspectorObliq', api.formatCopy('analemmaInspectorObliq', 'Compression factor {value}', { value: compressionText }));
    setInspectorText(
      'analemmaInspectorCombined',
      api.formatCopy(
        'analemmaInspectorCombined',
        'Daily difference = {mean} - ({mean} {ecc}) * {compression}\n= {diff} ({diffSeconds})',
        {
          mean: formatContribution(meanMotionDeg),
          ecc: eccText,
          compression: compressionText,
          diff: differenceDegText,
          diffSeconds: differenceSecText
        }
      )
    );

    if (insetMode === 'sidereal') {
      ctx.fillStyle = 'rgba(10,16,26,0.9)';
      ctx.fillRect(0, topPanelY, cssW, topPanelH);
      ctx.fillStyle = 'rgba(10,16,26,0.78)';
      ctx.fillRect(0, bottomPanelY, cssW, bottomPanelH);

      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      const borderLeft = Math.max(0, axisStart - axisPadding / 2);
      const borderWidth = Math.max(0, axisEnd - borderLeft);
      ctx.strokeRect(borderLeft, topPanelY + 1, borderWidth, topPanelH - 2);
      ctx.strokeRect(borderLeft, bottomPanelY + 1, borderWidth, bottomPanelH - 2);

      const drawLongitudeMarkers = (panelTop, panelH, scaleX, originX = axisStart, maxMarker = 2) => {
        ctx.strokeStyle = 'rgba(220,230,255,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(220,230,255,0.78)';
        const labelY = panelTop + panelH - 10;
        for (let marker = 0; marker <= maxMarker; marker += 1) {
          const x = originX + marker * scaleX;
          ctx.beginPath();
          ctx.moveTo(x, panelTop + 6);
          ctx.lineTo(x, panelTop + panelH - 6);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, panelTop + panelH - 12);
          ctx.lineTo(x, panelTop + panelH - 4);
          ctx.stroke();
          const label = marker === 0 ? '0' : `+${marker}`;
          ctx.fillText(label, x, labelY);
        }
        ctx.setLineDash([]);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      };
      drawGuide(axisStart, topMidY, axisEnd, topMidY);
      drawGuide(axisStart, bottomMidY, axisEnd, bottomMidY);
      drawLongitudeMarkers(topPanelY, topPanelH, topScaleX, axisStart, 1);
      drawLongitudeMarkers(bottomPanelY, bottomPanelH, pxPerDeg, axisStart);

      const topOriginX = axisStart;
      const topEndX = axisStart + realDeltaLon * topScaleX;
      const topEndY = topMidY - realDeltaLat * topScaleX * 0.6;
      drawArrow(topOriginX, topMidY, topEndX, topEndY, 'rgba(255,221,85,0.95)', 3);
      drawDot(topOriginX, topMidY, 'rgba(255,221,85,0.85)', 5);
      drawDot(topEndX, topEndY, 'rgba(255,221,85,0.85)', 5);
      const dx = topEndX - topOriginX;
      const dy = topEndY - topMidY;
      if (Math.abs(dx) > 0.001) {
        const targetX = dx >= 0 ? axisEnd : axisStart;
        const scale = (targetX - topOriginX) / dx;
        if (scale > 1) {
          const extX = topOriginX + dx * scale;
          const extY = topMidY + dy * scale;
          ctx.strokeStyle = 'rgba(126,231,135,0.45)';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(topEndX, topEndY);
          ctx.lineTo(extX, extY);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.font = '13px Arial, sans-serif';
      ctx.fillStyle = 'rgba(220,230,255,0.78)';
      ctx.textAlign = 'left';
      ctx.fillText(
        api.formatCopy('insetDeltaLon', 'dlon {value}', { value: fmtSignedDeg(realDeltaLon) }),
        axisStart + textPadding,
        topPanelY + topPanelH - 24
      );
      ctx.textAlign = 'right';
      ctx.fillText(
        api.formatCopy('insetDeltaLat', 'dlat {value}', { value: `${realDeltaLat.toFixed(3)}\u00B0` }),
        axisRight,
        topPanelY + topPanelH - 24
      );
      ctx.textAlign = 'left';

      const bottomOriginX = axisStart;
      const bottomEndX = axisStart + meanDeltaLon * pxPerDeg;
      drawArrow(bottomOriginX, bottomMidY, bottomEndX, bottomMidY, 'rgba(255,136,0,0.95)', 2.5);
      drawDot(bottomOriginX, bottomMidY, 'rgba(255,136,0,0.85)', 5);
      drawDot(bottomEndX, bottomMidY, 'rgba(255,136,0,0.85)', 5);
      const realLonX = axisStart + realDeltaLon * pxPerDeg;
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,221,85,0.5)';
      ctx.beginPath();
      ctx.moveTo(realLonX, bottomPanelY + 8);
      ctx.lineTo(realLonX, bottomPanelY + bottomPanelH - 8);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      drawDot(realLonX, bottomPanelY + 12, 'rgba(255,221,85,0.85)', 3);
      ctx.font = '12px Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,221,85,0.85)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(api.copyText('insetRealSunLabel', 'Real Sun'), realLonX + 6, bottomPanelY + 6);
      ctx.textAlign = 'start';
      ctx.fillStyle = 'rgba(220,230,255,0.78)';
      ctx.font = '13px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        api.formatCopy('insetDeltaLon', 'dlon {value}', { value: fmtSignedDeg(meanDeltaLon) }),
        axisStart + textPadding,
        bottomPanelY + bottomPanelH - 24
      );
    }
  }

  api.hooks.onUpdate(({ date, sun, meanSun }) => {
    if (!sun) return;
    analemmaPath.drawObliquityTrace();
    if (analemmaInsetState.enabled) {
      updateAnalemmaInset(analemmaInsetState.mode, sun, meanSun);
    }
    updateAnalemmaPanels(date, sun, meanSun);
  });

  api.hooks.onResize(() => {
    updateAnalemmaChartHeights();
    const lastSubpoints = api.getLastSubpoints?.();
    const current = api.getTimeOverride?.()
      ?? (api.parseUTC(document.getElementById('datetime')?.value) ?? new Date());
    if (lastSubpoints?.sun) {
      updateAnalemmaPanels(current, lastSubpoints.sun, lastSubpoints.meanSun);
      if (analemmaInsetState.enabled) {
        updateAnalemmaInset(analemmaInsetState.mode, lastSubpoints.sun, lastSubpoints.meanSun);
      }
    } else {
      api.updateCelestial();
    }
  });

  initAnalemmaBreakdown();
}
