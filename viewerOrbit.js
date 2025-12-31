export const prepareOrbitCanvas = ({
  canvas,
  ctx,
  background = '#0b1222',
  axisColor = '#1a2235'
} = {}) => {
  if (!canvas || !ctx) return null;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, h);
  ctx.stroke();

  return { w, h, cx, cy };
};

export const setOrbitLabelStyle = (ctx, {
  color = '#cfdcff',
  font = '12px Arial'
} = {}) => {
  if (!ctx) return;
  ctx.fillStyle = color;
  ctx.font = font;
};

export const updateLocalTimeBox = ({
  boxId = 'localTime',
  point,
  date,
  pointTimeZone,
  formatLocalTime,
  defaultTimeZone = 'UTC',
  label = 'Local time'
} = {}) => {
  const box = document.getElementById(boxId);
  if (!box) return;
  if (!point) {
    box.innerHTML = '';
    return;
  }
  const utc = date ?? new Date();
  const tz = pointTimeZone(point) || defaultTimeZone;
  const formatted = formatLocalTime(utc, tz);
  box.innerHTML = `<div><strong>${label} (${tz}):</strong> ${formatted}</div>`;
};
