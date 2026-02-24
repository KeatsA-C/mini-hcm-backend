import { db } from '../../lib/firebase.admin.js';

const round2 = (n) => Math.round(n * 100) / 100;

// ─── Assign Schedule ──────────────────────────────────────────────────────────

/**
 * Updates the work schedule (and optionally timezone) for a user.
 * Admin/superadmin only.
 * @param {string} targetUid  - UID of the employee to update
 * @param {{ start: string, end: string }} schedule - 'HH:MM' strings
 * @param {string} [timezone] - IANA timezone string, defaults to 'Asia/Manila'
 */
export async function assignSchedule(targetUid, { schedule, timezone }) {
  const ref = db.collection('users').doc(targetUid);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('User not found');

  const updates = {};

  if (schedule) {
    if (!schedule.start || !schedule.end) {
      throw new Error('schedule.start and schedule.end are required (HH:MM format)');
    }
    updates.schedule = { start: schedule.start, end: schedule.end };
  }

  if (timezone) {
    updates.timezone = timezone;
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('Provide at least one of schedule or timezone to update');
  }

  updates.updatedAt = new Date().toISOString();
  await ref.update(updates);

  const updated = await ref.get();
  return { uid: targetUid, ...updated.data() };
}

// ─── Punch Management (Admin) ─────────────────────────────────────────────────

/**
 * Fetch all attendance records for a specific employee.
 * Admin/superadmin only.
 */
export async function getEmployeePunches(targetUid, { startDate, endDate } = {}) {
  let query = db.collection('attendance').where('uid', '==', targetUid);

  // Range filters on the same field are allowed without a composite index.
  // Sorting is done in JS to avoid requiring a (uid, punchIn) composite index.
  if (startDate) query = query.where('punchIn', '>=', `${startDate}T00:00:00.000Z`);
  if (endDate) query = query.where('punchIn', '<=', `${endDate}T23:59:59.999Z`);

  const snap = await query.get();
  const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return records.sort((a, b) => b.punchIn.localeCompare(a.punchIn)); // newest first
}

/**
 * Edit a specific punch record by its Firestore document ID.
 * Allowed fields: punchIn (ISO string), punchOut (ISO string).
 * After editing, recomputes metrics and refreshes the daily summary.
 */
export async function editPunch(punchId, { punchIn, punchOut }) {
  const ref = db.collection('attendance').doc(punchId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Punch record not found');

  const data = snap.data();
  const updatedPunchIn = punchIn ? new Date(punchIn) : new Date(data.punchIn);
  const updatedPunchOut = punchOut
    ? new Date(punchOut)
    : data.punchOut
      ? new Date(data.punchOut)
      : null;

  const updates = {
    punchIn: updatedPunchIn.toISOString(),
    punchOut: updatedPunchOut ? updatedPunchOut.toISOString() : null,
    updatedAt: new Date().toISOString(),
    adminEdited: true,
  };

  // If punch is complete, recompute metrics
  if (updatedPunchOut) {
    const userDoc = await db.collection('users').doc(data.uid).get();
    if (!userDoc.exists) throw new Error('User not found');
    const { schedule, timezone } = userDoc.data();

    const { computeMetrics } = await import('../../lib/computeHours.js');
    const metrics = computeMetrics({
      punchIn: updatedPunchIn,
      punchOut: updatedPunchOut,
      schedule,
      timezone: timezone || 'Asia/Manila',
    });
    updates.metrics = metrics;

    // Rebuild daily summary for that date
    await rebuildDailySummary(data.uid, metrics.workDate);
  }

  await ref.update(updates);
  const updated = await ref.get();
  return { id: punchId, ...updated.data() };
}

/**
 * Permanently deletes a punch record.
 * Rebuilds (or removes) the daily summary for the affected date.
 */
export async function deletePunch(punchId) {
  const ref = db.collection('attendance').doc(punchId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Punch record not found');

  const data = snap.data();

  // Determine the workDate so we can rebuild the summary after deletion.
  // Prefer the already-computed metrics.workDate; fall back to the punchIn date.
  const workDate =
    data.metrics?.workDate ??
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(data.punchIn));

  await ref.delete();

  // Rebuild (or auto-delete if no punches remain for that day)
  await rebuildDailySummary(data.uid, workDate);

  return { id: punchId, deleted: true };
}

/**
 * Rebuilds the dailySummary document for a given uid + workDate
 * by re-aggregating all completed attendance records for that day.
 */
async function rebuildDailySummary(uid, workDate) {
  const summaryId = `${uid}_${workDate}`;

  const snap = await db.collection('attendance').where('uid', '==', uid).get();

  // Filter completed (non-voided) records for this workDate in JS to avoid composite index
  const dayRecords = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.metrics?.workDate === workDate && r.punchOut && r.punchOut !== 'VOIDED');

  if (dayRecords.length === 0) {
    await db.collection('dailySummary').doc(summaryId).delete();
    return;
  }

  const totals = (() => {
    // Sort punch pairs by punchIn ascending so first/last are deterministic
    const sorted = [...dayRecords].sort((a, b) => (a.punchIn ?? '').localeCompare(b.punchIn ?? ''));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    return sorted.reduce(
      (acc, r) => ({
        // Accumulate time-based metrics identically across all pairs
        regularHours: round2(acc.regularHours + (r.metrics?.regularHours || 0)),
        overtimeHours: round2(acc.overtimeHours + (r.metrics?.overtimeHours || 0)),
        nightDiffHours: round2(acc.nightDiffHours + (r.metrics?.nightDiffHours || 0)),
        totalWorkedHours: round2(acc.totalWorkedHours + (r.metrics?.totalWorkedHours || 0)),
        // lateMinutes  → first punch-in of the day only
        lateMinutes: first.metrics?.lateMinutes ?? 0,
        // undertimeMinutes → last punch-out of the day only
        undertimeMinutes: last.metrics?.undertimeMinutes ?? 0,
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
  })();

  await db
    .collection('dailySummary')
    .doc(summaryId)
    .set({
      uid,
      workDate,
      ...totals,
      punches: dayRecords.map((r) => ({
        attendanceId: r.id,
        punchIn: r.punchIn,
        punchOut: r.punchOut,
      })),
      updatedAt: new Date().toISOString(),
    });
}

// ─── Reporting ────────────────────────────────────────────────────────────────

/**
 * Returns all employees' daily summaries for a specific date.
 */
export async function getAllDailyReports(workDate) {
  const snap = await db.collection('dailySummary').where('workDate', '==', workDate).get();

  if (snap.empty) return [];

  // Enrich with user info
  const summaries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const uids = [...new Set(summaries.map((s) => s.uid))];

  const userDocs = await Promise.all(uids.map((uid) => db.collection('users').doc(uid).get()));
  const userMap = Object.fromEntries(userDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]));

  return summaries.map((s) => ({
    ...s,
    employee: userMap[s.uid]
      ? {
          firstName: userMap[s.uid].firstName,
          lastName: userMap[s.uid].lastName,
          department: userMap[s.uid].department,
          position: userMap[s.uid].position,
        }
      : null,
  }));
}

/**
 * Returns all employees' aggregated weekly summaries for [startDate, endDate].
 */
export async function getAllWeeklyReports(startDate, endDate) {
  const snap = await db
    .collection('dailySummary')
    .where('workDate', '>=', startDate)
    .where('workDate', '<=', endDate)
    .get();

  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Group by uid
  const byUid = {};
  for (const row of rows) {
    if (!byUid[row.uid]) {
      byUid[row.uid] = {
        uid: row.uid,
        days: [],
        totals: {
          regularHours: 0,
          overtimeHours: 0,
          nightDiffHours: 0,
          lateMinutes: 0,
          undertimeMinutes: 0,
          totalWorkedHours: 0,
        },
      };
    }
    byUid[row.uid].days.push(row);
    byUid[row.uid].totals.regularHours = round2(
      byUid[row.uid].totals.regularHours + (row.regularHours || 0),
    );
    byUid[row.uid].totals.overtimeHours = round2(
      byUid[row.uid].totals.overtimeHours + (row.overtimeHours || 0),
    );
    byUid[row.uid].totals.nightDiffHours = round2(
      byUid[row.uid].totals.nightDiffHours + (row.nightDiffHours || 0),
    );
    byUid[row.uid].totals.lateMinutes += row.lateMinutes || 0;
    byUid[row.uid].totals.undertimeMinutes += row.undertimeMinutes || 0;
    byUid[row.uid].totals.totalWorkedHours = round2(
      byUid[row.uid].totals.totalWorkedHours + (row.totalWorkedHours || 0),
    );
  }

  const uids = Object.keys(byUid);
  const userDocs = await Promise.all(uids.map((uid) => db.collection('users').doc(uid).get()));
  const userMap = Object.fromEntries(userDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]));

  return Object.values(byUid).map((entry) => ({
    ...entry,
    employee: userMap[entry.uid]
      ? {
          firstName: userMap[entry.uid].firstName,
          lastName: userMap[entry.uid].lastName,
          department: userMap[entry.uid].department,
          position: userMap[entry.uid].position,
        }
      : null,
    days: entry.days.sort((a, b) => a.workDate.localeCompare(b.workDate)),
  }));
}
