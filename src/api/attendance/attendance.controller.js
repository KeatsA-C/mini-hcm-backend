import {
  punchIn,
  punchOut,
  getPunchStatus,
  cancelOpenPunch,
  getAttendanceHistory,
  getDailySummary,
  getWeeklySummary,
} from './attendance.services.js';

// ─── GET /api/attendance/status ─────────────────────────────────────────────
// Returns whether the user is currently punched in + today's summary.

export async function getPunchStatusHandler(req, res) {
  try {
    const status = await getPunchStatus(req.user.uid);
    res.status(200).json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// ─── DELETE /api/attendance/cancel-punch/:attendanceId ───────────────────────
// Voids an accidental open punch. Only works on records with punchOut === null.

export async function cancelOpenPunchHandler(req, res) {
  try {
    const { attendanceId } = req.params;
    const result = await cancelOpenPunch(req.user.uid, attendanceId);
    res.status(200).json({ message: 'Punch cancelled successfully.', ...result });
  } catch (error) {
    const status = error.message.includes('not found')
      ? 404
      : error.message.includes('Forbidden')
        ? 403
        : error.message.includes('already completed')
          ? 409
          : 500;
    res.status(status).json({ error: error.message });
  }
}

// ─── POST /api/attendance/punch-in ───────────────────────────────────────────

export async function handlePunchIn(req, res) {
  try {
    const result = await punchIn(req.user.uid);
    res.status(201).json({ message: 'Punched in successfully', ...result });
  } catch (error) {
    const status = error.message.includes('already have') ? 409 : 500;
    res.status(status).json({ error: error.message });
  }
}

// ─── POST /api/attendance/punch-out ──────────────────────────────────────────

export async function handlePunchOut(req, res) {
  try {
    const result = await punchOut(req.user.uid);
    res.status(200).json({ message: 'Punched out successfully', ...result });
  } catch (error) {
    const status = error.message.includes('No open punch') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
}

// ─── GET /api/attendance/history ─────────────────────────────────────────────
// Query params: startDate, endDate (YYYY-MM-DD)

export async function getHistory(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const records = await getAttendanceHistory(req.user.uid, { startDate, endDate });
    res.status(200).json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// ─── GET /api/attendance/summary/daily ───────────────────────────────────────
// Query param: date (YYYY-MM-DD, default = today in UTC)

export async function getDailySummaryHandler(req, res) {
  try {
    const { date } = req.query;
    const workDate = date ?? new Date().toISOString().slice(0, 10);
    const summary = await getDailySummary(req.user.uid, workDate);
    if (!summary) return res.status(404).json({ error: `No summary found for ${workDate}` });
    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// ─── GET /api/attendance/summary/weekly ──────────────────────────────────────
// Query params: startDate, endDate (YYYY-MM-DD, default = current Mon–Sun)

export async function getWeeklySummaryHandler(req, res) {
  try {
    let { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      const today = new Date();
      const day = today.getUTCDay(); // 0=Sun … 6=Sat
      const diffToMon = day === 0 ? -6 : 1 - day;
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() + diffToMon);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);

      startDate ??= monday.toISOString().slice(0, 10);
      endDate ??= sunday.toISOString().slice(0, 10);
    }

    const summary = await getWeeklySummary(req.user.uid, startDate, endDate);
    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
