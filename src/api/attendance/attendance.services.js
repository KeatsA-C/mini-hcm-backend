import { db } from '../../lib/firebase.admin.js';
import { computeMetrics } from '../../lib/computeHours.js';

// ─── Punch Status ────────────────────────────────────────────────────────────

/**
 * Returns the current punch status for a user:
 *  - punchedIn: true/false
 *  - openPunch: the open attendance record (if any)
 *  - todaySummary: today's dailySummary doc (if any)
 */
export async function getPunchStatus(uid) {
  // Check for an open punch (punchOut === null)
  const openSnap = await db
    .collection('attendance')
    .where('uid', '==', uid)
    .where('punchOut', '==', null)
    .limit(1)
    .get();

  const openPunch = openSnap.empty ? null : { id: openSnap.docs[0].id, ...openSnap.docs[0].data() };

  const todayUtc = new Date().toISOString().slice(0, 10);
  const summaryId = `${uid}_${todayUtc}`;
  const summarySnap = await db.collection('dailySummary').doc(summaryId).get();
  const todaySummary = summarySnap.exists ? { id: summarySnap.id, ...summarySnap.data() } : null;

  return {
    punchedIn: !openSnap.empty,
    openPunch,
    todaySummary,
  };
}

export async function cancelOpenPunch(uid, attendanceId) {
  const ref = db.collection('attendance').doc(attendanceId);
  const snap = await ref.get();

  if (!snap.exists) throw new Error('Punch record not found.');

  const data = snap.data();

  if (data.uid !== uid) throw new Error('Forbidden: This punch does not belong to you.');

  if (data.punchOut !== null) {
    throw new Error(
      'This punch is already completed. Use the admin edit endpoint to correct a completed punch.',
    );
  }

  await ref.update({
    voided: true,
    voidedAt: new Date().toISOString(),
    voidReason: 'Cancelled by user',
    punchOut: 'VOIDED', // non-null so it no longer shows as "open"
  });

  return { id: attendanceId, voided: true };
}

// ─── Punch In ─────────────────────────────────────────────────────────────────

/**
 * Creates an open punch record (no punchOut yet).
 * Throws if the user already has an open punch today.
 */
export async function punchIn(uid) {
  // Check for an existing open punch
  const open = await db
    .collection('attendance')
    .where('uid', '==', uid)
    .where('punchOut', '==', null)
    .limit(1)
    .get();

  if (!open.empty) throw new Error('You already have an open punch. Please punch out first.');

  const now = new Date();
  const ref = await db.collection('attendance').add({
    uid,
    punchIn: now.toISOString(),
    punchOut: null,
    metrics: null,
    createdAt: now.toISOString(),
  });

  return { id: ref.id, punchIn: now.toISOString() };
}

// ─── Punch Out ────────────────────────────────────────────────────────────────

/**
 * Closes the most-recent open punch, computes metrics, and upserts the daily summary.
 */
export async function punchOut(uid) {
  // Find open punch
  const openSnap = await db
    .collection('attendance')
    .where('uid', '==', uid)
    .where('punchOut', '==', null)
    .limit(1)
    .get();

  if (openSnap.empty) throw new Error('No open punch found. Please punch in first.');

  const punchDoc = openSnap.docs[0];
  const punchData = punchDoc.data();
  const now = new Date();
  const punchInDate = new Date(punchData.punchIn);

  // Fetch user schedule + timezone from Firestore
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) throw new Error('User profile not found');
  const { schedule, timezone } = userDoc.data();

  if (!schedule?.start || !schedule?.end) {
    throw new Error('User schedule is not configured. Contact your administrator.');
  }

  const metrics = computeMetrics({
    punchIn: punchInDate,
    punchOut: now,
    schedule,
    timezone: timezone || 'UTC',
  });

  // Update punch record
  await punchDoc.ref.update({
    punchOut: now.toISOString(),
    metrics,
    updatedAt: now.toISOString(),
  });

  // Upsert daily summary
  await upsertDailySummary(uid, metrics, punchInDate, now, punchDoc.id);

  return { id: punchDoc.id, punchOut: now.toISOString(), metrics };
}

// ─── Daily Summary ────────────────────────────────────────────────────────────

/**
 * Creates or updates the dailySummary document for a given workDate + uid.
 *
 * Multi-punch (break-time) rules:
 *  - regularHours / overtimeHours / nightDiffHours / totalWorkedHours
 *      → accumulated from every punch pair (correct to sum)
 *  - lateMinutes
 *      → taken from the FIRST punch-in of the day only;
 *        break punch-ins are NOT counted as late arrivals
 *  - undertimeMinutes
 *      → taken from the LAST punch-out only (REPLACED, not added);
 *        intermediate punch-outs (e.g. lunch break) are NOT undertime
 */
async function upsertDailySummary(uid, metrics, punchInDate, punchOutDate, attendanceId) {
  const summaryId = `${uid}_${metrics.workDate}`;
  const ref = db.collection('dailySummary').doc(summaryId);
  const snap = await ref.get();

  const entry = {
    attendanceId,
    punchIn: punchInDate.toISOString(),
    punchOut: punchOutDate.toISOString(),
  };

  if (!snap.exists) {
    // ── First punch of the day ──────────────────────────────────────────────
    await ref.set({
      uid,
      workDate: metrics.workDate,
      regularHours: metrics.regularHours,
      overtimeHours: metrics.overtimeHours,
      nightDiffHours: metrics.nightDiffHours,
      lateMinutes: metrics.lateMinutes, // first punch determines lateness
      undertimeMinutes: metrics.undertimeMinutes, // will be overwritten by later punches
      totalWorkedHours: metrics.totalWorkedHours,
      punches: [entry],
      updatedAt: new Date().toISOString(),
    });
  } else {
    // ── Subsequent punch (e.g. back from lunch break) ───────────────────────
    const prev = snap.data();
    await ref.update({
      // Accumulate time-based metrics
      regularHours: round2(prev.regularHours + metrics.regularHours),
      overtimeHours: round2(prev.overtimeHours + metrics.overtimeHours),
      nightDiffHours: round2(prev.nightDiffHours + metrics.nightDiffHours),
      totalWorkedHours: round2(prev.totalWorkedHours + metrics.totalWorkedHours),
      // lateMinutes: KEEP the original — break punch-ins are never counted as late
      lateMinutes: prev.lateMinutes,
      // undertimeMinutes: REPLACE with this punch's value — only the last
      // punch-out of the day determines undertime.  When an employee returns
      // from break and finishes their shift, this naturally resets to 0.
      undertimeMinutes: metrics.undertimeMinutes,
      punches: [...(prev.punches || []), entry],
      updatedAt: new Date().toISOString(),
    });
  }
}

const round2 = (n) => Math.round(n * 100) / 100;

// ─── History & Summary Queries ─────────────────────────────────────────────────

/**
 * Returns all attendance records for a user, newest first.
 * Optional date range: startDate / endDate as 'YYYY-MM-DD' strings (compared against punchIn ISO).
 */
export async function getAttendanceHistory(uid, { startDate, endDate } = {}) {
  let query = db.collection('attendance').where('uid', '==', uid);

  if (startDate) query = query.where('punchIn', '>=', `${startDate}T00:00:00.000Z`);
  if (endDate) query = query.where('punchIn', '<=', `${endDate}T23:59:59.999Z`);

  const snap = await query.get();
  const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return records.sort((a, b) => b.punchIn.localeCompare(a.punchIn)); // newest first
}

/**
 * Daily summary for a user on a specific date (defaults to today in UTC).
 */
export async function getDailySummary(uid, workDate) {
  const summaryId = `${uid}_${workDate}`;
  const doc = await db.collection('dailySummary').doc(summaryId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

/**
 * Weekly summary: aggregate dailySummary records for uid in [startDate, endDate].
 */
export async function getWeeklySummary(uid, startDate, endDate) {
  const snap = await db
    .collection('dailySummary')
    .where('uid', '==', uid)
    .where('workDate', '>=', startDate)
    .where('workDate', '<=', endDate)
    .get();

  const days = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  days.sort((a, b) => a.workDate.localeCompare(b.workDate)); // oldest first

  const totals = days.reduce(
    (acc, d) => ({
      regularHours: round2(acc.regularHours + (d.regularHours || 0)),
      overtimeHours: round2(acc.overtimeHours + (d.overtimeHours || 0)),
      nightDiffHours: round2(acc.nightDiffHours + (d.nightDiffHours || 0)),
      lateMinutes: acc.lateMinutes + (d.lateMinutes || 0),
      undertimeMinutes: acc.undertimeMinutes + (d.undertimeMinutes || 0),
      totalWorkedHours: round2(acc.totalWorkedHours + (d.totalWorkedHours || 0)),
    }),
    {
      regularHours: 0,
      overtimeHours: 0,
      nightDiffHours: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
      totalWorkedHours: 0,
    },
  );

  return { uid, startDate, endDate, totals, days };
}
