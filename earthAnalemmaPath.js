import * as THREE from 'three';

export const createAnalemmaPath = ({
  getSubpoints,
  latLonToVec3,
  tourHighlightGroup,
  getTimeOverride,
  getDateTimeValue,
  parseUTC
}) => {
  let analemmaTrace = {
    startMs: null,
    totalPoints: 0,
    dayMs: 86400000,
    radius: null,
    geometry: null,
    line: null
  };
  const obliquityTrace = {
    enabled: false,
    startDate: null,
    timespanMs: 0
  };

  const clearAnalemmaTrace = () => {
    if (analemmaTrace.line) {
      if (analemmaTrace.line.parent) analemmaTrace.line.parent.remove(analemmaTrace.line);
      analemmaTrace.line.material?.dispose?.();
      analemmaTrace.line.geometry?.dispose?.();
    } else if (analemmaTrace.geometry) {
      analemmaTrace.geometry.dispose();
    }
    analemmaTrace = {
      startMs: null,
      totalPoints: 0,
      dayMs: 86400000,
      radius: null,
      geometry: null,
      line: null
    };
  };

  const ensureAnalemmaTrace = (startDate, timespanMs, radius = 1.016) => {
    const startMs = startDate.getTime();
    const dayMs = analemmaTrace.dayMs;
    const spanDays = Math.max(1, Math.round((timespanMs || 0) / dayMs));
    const totalPoints = spanDays + 1;
    if (analemmaTrace.line && analemmaTrace.startMs === startMs && analemmaTrace.totalPoints === totalPoints && analemmaTrace.radius === radius) return;

    clearAnalemmaTrace();
    analemmaTrace.startMs = startMs;
    analemmaTrace.totalPoints = totalPoints;
    analemmaTrace.radius = radius;

    const positions = new Float32Array(totalPoints * 3);
    for (let i = 0; i < totalPoints; i++) {
      const dt = new Date(startMs + i * dayMs);
      const sp = getSubpoints(dt, false).sun;
      const vec = latLonToVec3(sp.lat, sp.lon, radius);
      positions[i * 3] = vec.x;
      positions[i * 3 + 1] = vec.y;
      positions[i * 3 + 2] = vec.z;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.85, depthWrite: false });
    const line = new THREE.Line(geom, mat);
    line.frustumCulled = false;
    analemmaTrace.geometry = geom;
    analemmaTrace.line = line;
  };

  const drawObliquityTrace = () => {
    if (!obliquityTrace.enabled || !obliquityTrace.startDate) return;
    ensureAnalemmaTrace(obliquityTrace.startDate, obliquityTrace.timespanMs, 1.002);
    const current = getTimeOverride() ?? (parseUTC(getDateTimeValue()) ?? new Date());
    const idx = Math.round((current.getTime() - obliquityTrace.startDate.getTime()) / analemmaTrace.dayMs);
    const count = Math.max(0, Math.min(analemmaTrace.totalPoints, idx + 1));
    if (analemmaTrace.geometry) analemmaTrace.geometry.setDrawRange(0, count);
    if (analemmaTrace.line) tourHighlightGroup.add(analemmaTrace.line);
  };

  return {
    analemmaTrace,
    obliquityTrace,
    clearAnalemmaTrace,
    ensureAnalemmaTrace,
    drawObliquityTrace
  };
};

export const createAnalemmaTooltip = ({ tooltip, getTooltipLines }) => {
  const show = (lines, clientX, clientY, pinned) => {
    const el = tooltip.el;
    if (!el || !lines || !lines.length) return;
    el.innerHTML = lines.map(line => `<div>${line}</div>`).join('');
    const offset = 12;
    let x = clientX + offset;
    let y = clientY + offset;
    const rect = el.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 6) x = clientX - rect.width - offset;
    if (y + rect.height > window.innerHeight - 6) y = clientY - rect.height - offset;
    el.style.left = `${Math.max(6, x)}px`;
    el.style.top = `${Math.max(6, y)}px`;
    el.classList.add('show');
    if (pinned) {
      tooltip.pinned = true;
    }
  };

  const hide = () => {
    const el = tooltip.el;
    if (!el) return;
    el.classList.remove('show');
  };

  const attach = (canvas, type) => {
    if (!canvas) return;
    canvas.addEventListener('pointermove', (event) => {
      if (tooltip.pinned && tooltip.source === type) return;
      const rect = canvas.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const lines = getTooltipLines(type, localX, localY);
      if (!lines) {
        if (!tooltip.pinned) hide();
        return;
      }
      tooltip.source = type;
      show(lines, event.clientX, event.clientY);
    });
    canvas.addEventListener('pointerleave', () => {
      if (!tooltip.pinned || tooltip.source !== type) hide();
    });
    canvas.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      const rect = canvas.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const lines = getTooltipLines(type, localX, localY);
      if (!lines) return;
      if (tooltip.pinned && tooltip.source === type) {
        tooltip.pinned = false;
        tooltip.source = null;
        hide();
        return;
      }
      tooltip.source = type;
      show(lines, event.clientX, event.clientY, true);
    });
  };

  return { attach, hide };
};
