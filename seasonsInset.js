export const createSeasonsInset = ({
  getTourState,
  getTimeOverride,
  getDateTimeValue,
  getTwilightAngle,
  copyText,
  formatCopy,
  formatHours,
  parseUTC,
  normalizeDeg,
  TAU,
  sunDeclinationForYear,
  daylightHours,
  daylightHoursAtAltitude
}) => {
  const hide = () => {
    const box = document.getElementById('seasonsInsetBox');
    if (box) box.style.display = 'none';
  };

  const update = (sun) => {
    const box = document.getElementById('seasonsInsetBox');
    const canvas = document.getElementById('seasonsInset');
    if (!box || !canvas) return;
    const tourState = getTourState();
    if (!tourState?.active || tourState.tourId !== 'seasons' || !tourState.poi || !sun) {
      hide();
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      hide();
      return;
    }

    const current = getTimeOverride() ?? (parseUTC(getDateTimeValue()) ?? new Date());
    const year = current.getUTCFullYear();
    const decs = sunDeclinationForYear(year);
    const days = decs.length;
    const lat = tourState.poi.lat;
    const twilightAngle = Math.max(0, getTwilightAngle() || 0);
    const twilightAlt = twilightAngle > 0 ? -twilightAngle : -0.833;

    const dayHoursSeries = new Array(days);
    const twilightHoursSeries = new Array(days);
    let maxHours = 24;
    for (let i = 0; i < days; i++) {
      const dec = decs[i];
      const dayDur = daylightHours(lat, dec).day;
      const twiDur = daylightHoursAtAltitude(lat, dec, twilightAlt).day;
      dayHoursSeries[i] = dayDur;
      twilightHoursSeries[i] = twiDur;
      if (twiDur > maxHours) maxHours = twiDur;
    }

    const startOfYear = Date.UTC(year, 0, 1);
    const dayIndex = Math.max(
      0,
      Math.min(
        days - 1,
        Math.floor((Date.UTC(year, current.getUTCMonth(), current.getUTCDate()) - startOfYear) / 86400000)
      )
    );

    const wasHidden = getComputedStyle(box).display === 'none';
    if (wasHidden) {
      box.style.display = 'block';
      box.style.visibility = 'hidden';
    } else {
      box.style.display = 'block';
    }

    const cssW = Math.max(320, Math.round(box.clientWidth || 520));
    const cssH = 360; // fixed to prevent layout creep
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const needW = Math.round(cssW * dpr);
    const needH = Math.round(cssH * dpr);
    if (canvas.width !== needW) canvas.width = needW;
    if (canvas.height !== needH) canvas.height = needH;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    box.style.visibility = '';

    // Styling constants
    const dayColor = '#8cff8c';
    const twiColor = '#f9c56e';
    const axisColor = 'rgba(255,255,255,0.18)';
    const textColor = 'rgba(220,230,255,0.84)';
    const nightColor = '#8899ff';

    const margin = { left: 46, right: 14, top: 22, bottom: 210 };
    const plotW = cssW - margin.left - margin.right;
    const plotH = cssH - margin.top - margin.bottom;
    const xAt = (i) => margin.left + (plotW * i) / Math.max(1, days - 1);
    const yAt = (hours) => {
      const clamped = Math.min(maxHours, Math.max(0, hours));
      return margin.top + plotH * (1 - clamped / maxHours);
    };

    // Background
    ctx.fillStyle = 'rgba(10,16,26,0.45)';
    ctx.fillRect(0, 0, cssW, cssH);

    // Horizontal grid
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1;
    [0, 6, 12, 18, 24].forEach(h => {
      const y = yAt(h);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(cssW - margin.right, y);
      ctx.stroke();
      ctx.fillStyle = textColor;
      ctx.font = '12px Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${h}h`, margin.left - 8, y);
    });

    // Month ticks
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = textColor;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    monthNames.forEach((name, idx) => {
      const di = Math.floor((Date.UTC(year, idx, 1) - startOfYear) / 86400000);
      const x = xAt(di);
      ctx.beginPath();
      ctx.moveTo(x, margin.top + plotH);
      ctx.lineTo(x, margin.top + plotH + 4);
      ctx.stroke();
      ctx.fillText(name, x, cssH - margin.bottom + 6);
    });
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    // Twilight fill + line
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(twilightHoursSeries[0]));
    for (let i = 1; i < days; i++) ctx.lineTo(xAt(i), yAt(twilightHoursSeries[i]));
    ctx.lineTo(xAt(days - 1), margin.top + plotH);
    ctx.lineTo(xAt(0), margin.top + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(249,197,110,0.16)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(twilightHoursSeries[0]));
    for (let i = 1; i < days; i++) ctx.lineTo(xAt(i), yAt(twilightHoursSeries[i]));
    ctx.strokeStyle = twiColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Daylight line
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(dayHoursSeries[0]));
    for (let i = 1; i < days; i++) ctx.lineTo(xAt(i), yAt(dayHoursSeries[i]));
    ctx.strokeStyle = dayColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Cursor on current day
    const cx = xAt(dayIndex);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, margin.top);
    ctx.lineTo(cx, margin.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    const drawDot = (x, y, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    drawDot(cx, yAt(dayHoursSeries[dayIndex]), dayColor);
    drawDot(cx, yAt(twilightHoursSeries[dayIndex]), twiColor);

    // Legends
    ctx.fillStyle = textColor;
    ctx.font = '12px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const twilightDuration = Math.max(0, twilightHoursSeries[dayIndex] - dayHoursSeries[dayIndex]);
    const dayLegend = formatCopy(
      'seasonsInsetDaylight',
      'Daylight: {hours}',
      { hours: formatHours(dayHoursSeries[dayIndex]) }
    );
    const twiLabel = twilightAngle > 0
      ? formatCopy(
          'seasonsInsetTwilightAngle',
          'Twilight duration (-{angle} deg): {hours}',
          { angle: twilightAngle, hours: formatHours(twilightDuration) }
        )
      : formatCopy(
          'seasonsInsetTwilight',
          'Twilight duration: {hours}',
          { hours: formatHours(twilightDuration) }
        );
    ctx.fillText(dayLegend, margin.left, 6);
    ctx.fillText(twiLabel, margin.left, 24);
    ctx.textAlign = 'right';
    ctx.fillText(
      formatCopy('seasonsInsetLatYear', 'Lat {lat} deg, {year}', { lat: lat.toFixed(2), year }),
      cssW - margin.right,
      6
    );
    ctx.textAlign = 'start';
    // Bottom panel: day/night circle with location marker moving with Earth rotation.
    const deltaLon = normalizeDeg(tourState.poi.lon - sun.lon); // location vs subsolar
    const localSolarHours = ((12 + deltaLon / 15) % 24 + 24) % 24;
    const circleR = 70;
    const circleCx = margin.left + circleR + 10;
    const circleCy = cssH - 80;
    ctx.fillStyle = textColor;
    ctx.font = '12px Arial, sans-serif';
    ctx.fillText(copyText('seasonsInsetHeading', 'Today at this latitude'), margin.left, circleCy - circleR - 20);
    const lstToAngle = (lst) => -((lst - 12) * TAU / 24);
    const dayDurHours = Math.max(0, Math.min(24, dayHoursSeries[dayIndex]));
    const nightDurHours = 24 - dayDurHours;
    const sunriseLST = 12 - dayDurHours / 2;
    const sunsetLST = 12 + dayDurHours / 2;
    const startDay = lstToAngle(sunriseLST);
    const endDay = lstToAngle(sunsetLST);

    ctx.lineWidth = 10;
    // Base night ring
    ctx.strokeStyle = nightColor;
    ctx.beginPath();
    ctx.arc(circleCx, circleCy, circleR, 0, TAU);
    ctx.stroke();
    // Day arc (handle polar day/night)
    if (dayDurHours >= 23.99) {
      ctx.strokeStyle = dayColor;
      ctx.beginPath();
      ctx.arc(circleCx, circleCy, circleR, 0, TAU);
      ctx.stroke();
    } else if (dayDurHours <= 0.01) {
      // already night-only ring
    } else {
      ctx.strokeStyle = dayColor;
      ctx.beginPath();
      ctx.arc(circleCx, circleCy, circleR, startDay, endDay, true);
      ctx.stroke();
    }
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = axisColor;
    ctx.beginPath();
    ctx.arc(circleCx, circleCy, circleR, 0, TAU);
    ctx.stroke();

    // Marker for the selected location, rotates with local solar time.
    const angleRad = lstToAngle(localSolarHours); // noon on the right (0), midnight left
    const markerR = circleR - 14;
    const mx = circleCx + markerR * Math.cos(angleRad);
    const my = circleCy + markerR * Math.sin(angleRad);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(mx, my, 6, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Labels
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(copyText('seasonsInsetDayLabel', 'Day'), circleCx + circleR + 12, circleCy);
    ctx.textAlign = 'right';
    ctx.fillText(copyText('seasonsInsetNightLabel', 'Night'), circleCx - circleR - 12, circleCy);
    ctx.textAlign = 'start';
    const fmtHhMm = (h) => {
      const hh = Math.floor(h) % 24;
      const mm = Math.round((h - Math.floor(h)) * 60);
      return `${String((hh + 24) % 24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    };
    const lstLabel = formatCopy(
      'seasonsInsetLocalSolarTime',
      'Local solar time: {hhmm}',
      { hhmm: fmtHhMm(localSolarHours) }
    );
    ctx.fillText(lstLabel, margin.left, circleCy + circleR + 24);
  };

  return { update, hide };
};
