export const createDaylightPanel = ({
  earthRadiusKm,
  copyText,
  formatCopy,
  singlePointMode = false,
  daylightHours,
  updatePointMetrics
}) => {
  const formatHours = (hours) => {
    const h = Math.floor(hours);
    let m = Math.round((hours - h) * 60);
    let hh = h;
    if (m === 60) { hh += 1; m = 0; }
    return `${hh}h ${String(m).padStart(2, '0')}m`;
  };

  const updateDurations = (sun, moon) => {
    const box = document.getElementById('durations');
    if (!box) return;
    if (!sun) {
      box.innerHTML = '';
      return;
    }
    const points = [];
    const lat1El = document.getElementById('lat1');
    const lon1El = document.getElementById('lon1');
    const pointLabelSingle = copyText('pointLabelSingle', 'Point');
    const pointLabelA = copyText('pointLabelA', 'Point A');
    const pointLabelB = copyText('pointLabelB', 'Point B');
    if (lat1El && lon1El) {
      points.push({
        label: singlePointMode ? pointLabelSingle : pointLabelA,
        lat: parseFloat(lat1El.value),
        lon: parseFloat(lon1El.value),
        color: 0xff6699
      });
    }
    if (!singlePointMode) {
      const lat2El = document.getElementById('lat2');
      const lon2El = document.getElementById('lon2');
      if (lat2El && lon2El) {
        points.push({
          label: pointLabelB,
          lat: parseFloat(lat2El.value),
          lon: parseFloat(lon2El.value),
          color: 0x66ff99
        });
      }
    }
    const filtered = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (!filtered.length) {
      const prompt = copyText('durationsPrompt', 'Select a point to see day/night duration.');
      box.innerHTML = `<div style="color:#8aa2d3;">${prompt}</div>`;
      updatePointMetrics({
        points: [],
        earthRadiusKm,
        copyText,
        formatCopy
      });
      return;
    }
    const dayLabel = copyText('labelDay', 'Day');
    const nightLabel = copyText('labelNight', 'Night');
    const moonUpLabel = copyText('labelMoonUp', 'Moon up');
    const rows = filtered.map(p => {
      const colorHex = `#${p.color.toString(16).padStart(6, '0')}`;
      const colorDot = `<span style="display:inline-block; width:10px; height:10px; background:${colorHex}; margin-inline-end:6px; border-radius:2px; vertical-align:middle;"></span>`;
      const sunDur = daylightHours(p.lat, sun.lat);
      if (!moon) {
        return `<div>${colorDot}<strong>${p.label}:</strong> ${dayLabel} ${formatHours(sunDur.day)}, ${nightLabel} ${formatHours(sunDur.night)}</div>`;
      }
      const moonDur = daylightHours(p.lat, moon.lat);
      return `<div>${colorDot}<strong>${p.label}:</strong> ${dayLabel} ${formatHours(sunDur.day)}, ${nightLabel} ${formatHours(sunDur.night)}, ${moonUpLabel} ${formatHours(moonDur.day)}</div>`;
    });
    box.innerHTML = rows.join('');
    updatePointMetrics({
      points: filtered,
      earthRadiusKm,
      copyText,
      formatCopy
    });
  };

  return { updateDurations, formatHours };
};
