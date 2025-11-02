export const fmtLocal = (isoUtc: string, tz = 'America/Chicago') =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
    timeZone: tz,
  }).format(new Date(isoUtc));
