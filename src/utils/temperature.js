// src/utils/temperature.js

/** Convert °F to °C, rounded to 1 decimal. Returns null if input is null. */
export function toC(f) {
  if (f == null) return null;
  return Math.round((f - 32) * 5 / 9 * 10) / 10;
}

/** Convert a stored °F value to the display unit. */
export function toDisplay(f, unit) {
  if (f == null) return null;
  return unit === 'C' ? toC(f) : f;
}

/**
 * Convert a user-typed value (in display unit) back to °F for storage.
 * Returns a number, or null if the input is empty/invalid.
 */
export function fromDisplay(val, unit) {
  if (val === '' || val == null) return null;
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  if (unit === 'C') return Math.round(n * 9 / 5 + 32);
  return n;
}

/** °F or °C symbol string. */
export function unitLabel(unit) {
  return unit === 'C' ? '°C' : '°F';
}
