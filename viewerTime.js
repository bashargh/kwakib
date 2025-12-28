export const formatUTC = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
};

export const parseUTC = (str) => {
  if (!str) return null;
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0));
};

export const caretUnit = (pos) => {
  if (pos <= 4) return 'year';
  if (pos <= 7) return 'month';
  if (pos <= 10) return 'day';
  if (pos <= 13) return 'hour';
  return 'minute';
};

export const rangeForUnit = (unit) => {
  switch (unit) {
    case 'year': return { start: 0, end: 4 };
    case 'month': return { start: 5, end: 7 };
    case 'day': return { start: 8, end: 10 };
    case 'hour': return { start: 11, end: 13 };
    default: return { start: 14, end: 16 };
  }
};

export const adjustDate = (date, unit, delta) => {
  switch (unit) {
    case 'year': date.setUTCFullYear(date.getUTCFullYear() + delta); break;
    case 'month': date.setUTCMonth(date.getUTCMonth() + delta); break;
    case 'day': date.setUTCDate(date.getUTCDate() + delta); break;
    case 'hour': date.setUTCHours(date.getUTCHours() + delta); break;
    default: date.setUTCMinutes(date.getUTCMinutes() + delta); break;
  }
};

export const formatLocalTime = (date, tz) => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short'
    }).format(date);
  } catch (err) {
    return null;
  }
};

export const pointTimeZone = (point) => {
  if (!point) return null;
  try {
    return tzlookup(point.lat, point.lon);
  } catch (err) {
    return null;
  }
};
