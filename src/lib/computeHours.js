function toZonedParts(date, timezone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: parseInt(parts.year),
    month: parseInt(parts.month),
    day: parseInt(parts.day),
    hour: parseInt(parts.hour) % 24, // handle '24' edge case from some engines
    minute: parseInt(parts.minute),
    second: parseInt(parts.second),
  };
}

/**
 * Returns the local date string 'YYYY-MM-DD' for a Date in the given timezone.
 */
function getLocalDateString(date, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
}

function localToUtcMs(dateStr, timeStr, timezone) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);

  const guessMs = Date.UTC(y, mo - 1, d, h, mi, 0);

  const zp = toZonedParts(new Date(guessMs), timezone);
  const zonedMs = Date.UTC(zp.year, zp.month - 1, zp.day, zp.hour, zp.minute, zp.second);

  const offsetMs = guessMs - zonedMs;

  return guessMs - offsetMs;
}

function overlap(aStart, aEnd, bStart, bEnd) {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return Math.max(0, end - start);
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_MIN = 60_000;

const toHours = (ms) => Math.round((ms / MS_PER_HOUR) * 100) / 100;
const toMinutes = (ms) => Math.round(ms / MS_PER_MIN);

export function computeMetrics({ punchIn, punchOut, schedule, timezone }) {
  const workDate = getLocalDateString(punchIn, timezone); // 'YYYY-MM-DD'

  // Helper: get next-day date string
  const dayAfter = (dateStr) => {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return getLocalDateString(d, 'UTC');
  };
  const dayBefore = (dateStr) => {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return getLocalDateString(d, 'UTC');
  };

  const piMs = punchIn.getTime();
  const poMs = punchOut.getTime();

  const schedStartMs = localToUtcMs(workDate, schedule.start, timezone);
  const schedEndMs = localToUtcMs(workDate, schedule.end, timezone);

  const lateMs = Math.max(0, piMs - schedStartMs);
  const lateMinutes = toMinutes(lateMs);

  const undertimeMs = poMs < schedEndMs ? Math.max(0, schedEndMs - poMs) : 0;
  const undertimeMinutes = toMinutes(undertimeMs);

  const regularMs = overlap(piMs, poMs, schedStartMs, schedEndMs);
  const regularHours = toHours(regularMs);

  const otMs = Math.max(0, poMs - schedEndMs);
  const overtimeHours = toHours(otMs);

  const ndA_start = localToUtcMs(dayBefore(workDate), '22:00', timezone);
  const ndA_end = localToUtcMs(workDate, '06:00', timezone);

  const ndB_start = localToUtcMs(workDate, '22:00', timezone);
  const ndB_end = localToUtcMs(dayAfter(workDate), '06:00', timezone);

  const ndMs = overlap(piMs, poMs, ndA_start, ndA_end) + overlap(piMs, poMs, ndB_start, ndB_end);
  const nightDiffHours = toHours(ndMs);

  const totalWorkedHours = toHours(poMs - piMs);

  return {
    workDate,
    regularHours,
    overtimeHours,
    nightDiffHours,
    lateMinutes,
    undertimeMinutes,
    totalWorkedHours,
  };
}
