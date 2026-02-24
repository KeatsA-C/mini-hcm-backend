/**
 * All time computation is done in Asia/Manila local time (UTC+8, no DST).
 * punchIn / punchOut are standard JS Date objects (their .getTime() is UTC ms).
 * Schedule times ('HH:MM') and workDate ('YYYY-MM-DD') refer to Manila local time.
 *
 * Key identity: manilaLocalMs = utcMs + MANILA_OFFSET_MS
 *   → To read the Manila clock for a Date, add the offset then read UTC getters.
 *   → To build a UTC ms from a Manila local date + time, subtract the offset.
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8, fixed (no DST in Philippines)

/**
 * Returns 'YYYY-MM-DD' in Manila local time for the given Date.
 */
function getManilaDate(date) {
  const m = new Date(date.getTime() + MANILA_OFFSET_MS);
  const y = m.getUTCFullYear();
  const mo = String(m.getUTCMonth() + 1).padStart(2, '0');
  const d = String(m.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * Converts a Manila-local date string + time string to a UTC timestamp (ms).
 * Manila is always UTC+8, so: utcMs = manilaLocalMs − 8h
 */
function manilaToUtcMs(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, 0) - MANILA_OFFSET_MS;
}

/**
 * Returns the YYYY-MM-DD string for the calendar day after dateStr.
 */
function dayAfter(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + 1, 12, 0, 0));
  return [
    dt.getUTCFullYear(),
    String(dt.getUTCMonth() + 1).padStart(2, '0'),
    String(dt.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Returns the YYYY-MM-DD string for the calendar day before dateStr.
 */
function dayBefore(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d - 1, 12, 0, 0));
  return [
    dt.getUTCFullYear(),
    String(dt.getUTCMonth() + 1).padStart(2, '0'),
    String(dt.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function overlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_MIN = 60_000;

const toHours = (ms) => Math.round((ms / MS_PER_HOUR) * 100) / 100;
const toMinutes = (ms) => Math.round(ms / MS_PER_MIN);

/**
 * Computes attendance metrics for a single punch pair.
 *
 * @param {Date}   punchIn   - JS Date (UTC-based, from .toISOString() stored in DB)
 * @param {Date}   punchOut  - JS Date (UTC-based)
 * @param {{ start: string, end: string }} schedule - Manila local 'HH:MM' strings
 * @param {string} [timezone] - accepted for API compatibility but ignored;
 *                              computation is always in Asia/Manila (UTC+8)
 */
export function computeMetrics({ punchIn, punchOut, schedule }) {
  // workDate = Manila calendar date of punch-in
  const workDate = getManilaDate(punchIn);

  const piMs = punchIn.getTime();

  const endOfWorkDayMs = manilaToUtcMs(dayAfter(workDate), '00:00') - 1;
  const poMs = Math.min(punchOut.getTime(), endOfWorkDayMs);

  // Schedule window anchored to workDate in Manila time, converted to UTC ms
  const schedStartMs = manilaToUtcMs(workDate, schedule.start);
  const schedEndMs = manilaToUtcMs(workDate, schedule.end);

  // ── Late ─────────────────────────────────────────────────────────────────
  // Minutes past schedule start the employee arrived.
  const lateMs = Math.max(0, piMs - schedStartMs);
  const lateMinutes = toMinutes(lateMs);

  // ── Undertime ─────────────────────────────────────────────────────────────
  // Schedule time lost by punching out before schedule end.
  const undertimeMs =
    poMs < schedEndMs ? Math.max(0, schedEndMs - Math.max(poMs, schedStartMs)) : 0;
  const undertimeMinutes = toMinutes(undertimeMs);

  // ── Regular hours ─────────────────────────────────────────────────────────
  // Actual time worked within the schedule window (early arrivals do NOT pad this).
  const regularMs = overlap(piMs, poMs, schedStartMs, schedEndMs);
  const regularHours = toHours(regularMs);

  // ── Overtime ──────────────────────────────────────────────────────────────
  // Time worked strictly after schedule end.
  // max(piMs, schedEndMs): if the employee only started after schedEnd
  // (e.g. an extra shift at 20:00 on a 09-18 schedule) OT starts at punchIn,
  // NOT at 18:00 — preventing phantom OT hours before they even showed up.
  const otMs = Math.max(0, poMs - Math.max(piMs, schedEndMs));
  const overtimeHours = toHours(otMs);

  // ── Night Differential ────────────────────────────────────────────────────
  // Counts ALL minutes worked between 22:00 and 06:00 Manila across every
  // night within the punch span. Starting from the night before workDate
  // correctly captures graveyard shifts that punch in before 06:00.
  let ndMs = 0;
  let ndDay = dayBefore(workDate);
  while (true) {
    const windowStart = manilaToUtcMs(ndDay, '22:00');
    const windowEnd = manilaToUtcMs(dayAfter(ndDay), '06:00');
    if (windowStart >= poMs) break; // window starts after punchOut — stop
    ndMs += overlap(piMs, poMs, windowStart, windowEnd);
    ndDay = dayAfter(ndDay);
  }
  const nightDiffHours = toHours(ndMs);

  const totalWorkedHours = toHours(regularMs + otMs);

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
