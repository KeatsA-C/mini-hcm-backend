import {
  getEmployeePunches,
  editPunch,
  deletePunch,
  assignSchedule,
  getAllDailyReports,
  getAllWeeklyReports,
} from './admin.services.js';

// ─── GET /api/admin/punches/:uid ─────────────────────────────────────────────
// Query params: startDate, endDate ('YYYY-MM-DD')

export async function getEmployeePunchesHandler(req, res) {
  try {
    const { uid } = req.params;
    const { startDate, endDate } = req.query;
    const punches = await getEmployeePunches(uid, { startDate, endDate });
    res.status(200).json(punches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// ─── PUT /api/admin/punches/:punchId ─────────────────────────────────────────
// Body: { punchIn?: ISO string, punchOut?: ISO string }

export async function editPunchHandler(req, res) {
  try {
    const { punchId } = req.params;
    const { punchIn, punchOut } = req.body;

    if (!punchIn && !punchOut) {
      return res
        .status(400)
        .json({ error: 'Provide at least one of punchIn or punchOut to update' });
    }

    const updated = await editPunch(punchId, { punchIn, punchOut });
    res.status(200).json({ message: 'Punch updated successfully', ...updated });
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
}

// ─── DELETE /api/admin/punches/:punchId ──────────────────────────────────────

export async function deletePunchHandler(req, res) {
  try {
    const { punchId } = req.params;
    const result = await deletePunch(punchId);
    res.status(200).json({ message: 'Punch deleted successfully', ...result });
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
}

// ─── PUT /api/admin/schedule/:uid ────────────────────────────────────────────
// Body: { schedule?: { start: 'HH:MM', end: 'HH:MM' }, timezone?: string }

export async function assignScheduleHandler(req, res) {
  try {
    const { uid } = req.params;
    const { schedule, timezone } = req.body;
    const result = await assignSchedule(uid, { schedule, timezone });
    res.status(200).json({ message: 'Schedule updated successfully', ...result });
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
}

// ─── GET /api/admin/reports/daily ────────────────────────────────────────────
// Query param: date ('YYYY-MM-DD', defaults to today UTC)

export async function dailyReportHandler(req, res) {
  try {
    const { date } = req.query;
    const workDate = date ?? new Date().toISOString().slice(0, 10);
    const report = await getAllDailyReports(workDate);
    res.status(200).json({ date: workDate, count: report.length, data: report });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// ─── GET /api/admin/reports/weekly ───────────────────────────────────────────
// Query params: startDate, endDate ('YYYY-MM-DD', defaults to current Mon–Sun)

export async function weeklyReportHandler(req, res) {
  try {
    let { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      const today = new Date();
      const day = today.getUTCDay();
      const diffToMon = day === 0 ? -6 : 1 - day;
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() + diffToMon);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);

      startDate ??= monday.toISOString().slice(0, 10);
      endDate ??= sunday.toISOString().slice(0, 10);
    }

    const report = await getAllWeeklyReports(startDate, endDate);
    res.status(200).json({ startDate, endDate, count: report.length, data: report });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
