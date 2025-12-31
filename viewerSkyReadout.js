const DEFAULT_LABELS = {
  az: 'az',
  alt: 'alt',
  deg: ' deg',
  na: 'n/a',
  belowHorizon: ' (below horizon here)',
  pairSep: ','
};

const formatSkyValue = (value, labels) => (
  Number.isFinite(value) ? `${value.toFixed(1)}${labels.deg}` : labels.na
);

export const formatSkyAzAltRow = ({ label, az, alt, labels = {} }) => {
  const merged = { ...DEFAULT_LABELS, ...labels };
  const note = alt <= 0 ? merged.belowHorizon : '';
  return `<div><strong>${label}:</strong> ${merged.az} ${formatSkyValue(az, merged)}${merged.pairSep} ${merged.alt} ${formatSkyValue(alt, merged)}${note}</div>`;
};

export const formatSkyRows = ({ entries = [], labels = {} }) => (
  entries.map(entry => formatSkyAzAltRow({ ...entry, labels })).join('')
);
