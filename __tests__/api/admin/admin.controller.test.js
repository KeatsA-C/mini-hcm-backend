import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetEmployeePunches = jest.fn();
const mockEditPunch = jest.fn();
const mockDeletePunch = jest.fn();
const mockAssignSchedule = jest.fn();
const mockGetAllDailyReports = jest.fn();
const mockGetAllWeeklyReports = jest.fn();

jest.unstable_mockModule('../../../src/api/admin/admin.services.js', () => ({
  getEmployeePunches: mockGetEmployeePunches,
  editPunch: mockEditPunch,
  deletePunch: mockDeletePunch,
  assignSchedule: mockAssignSchedule,
  getAllDailyReports: mockGetAllDailyReports,
  getAllWeeklyReports: mockGetAllWeeklyReports,
}));

const {
  getEmployeePunchesHandler,
  editPunchHandler,
  deletePunchHandler,
  assignScheduleHandler,
  dailyReportHandler,
  weeklyReportHandler,
} = await import('../../../src/api/admin/admin.controller.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// ─── getEmployeePunchesHandler ────────────────────────────────────────────────

describe('getEmployeePunchesHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with punch records', async () => {
    const punches = [{ id: 'p1', punchIn: '2024-01-15T09:00:00Z' }];
    mockGetEmployeePunches.mockResolvedValueOnce(punches);
    const req = { params: { uid: 'u1' }, query: {} };
    const res = mockRes();
    await getEmployeePunchesHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(punches);
    expect(mockGetEmployeePunches).toHaveBeenCalledWith('u1', {
      startDate: undefined,
      endDate: undefined,
    });
  });

  it('passes startDate and endDate query params to service', async () => {
    mockGetEmployeePunches.mockResolvedValueOnce([]);
    const req = {
      params: { uid: 'u1' },
      query: { startDate: '2024-01-01', endDate: '2024-01-31' },
    };
    const res = mockRes();
    await getEmployeePunchesHandler(req, res);
    expect(mockGetEmployeePunches).toHaveBeenCalledWith('u1', {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });
  });

  it('returns 500 on service error', async () => {
    mockGetEmployeePunches.mockRejectedValueOnce(new Error('DB error'));
    const req = { params: { uid: 'u1' }, query: {} };
    const res = mockRes();
    await getEmployeePunchesHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── editPunchHandler ─────────────────────────────────────────────────────────

describe('editPunchHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when neither punchIn nor punchOut is provided', async () => {
    const req = { params: { punchId: 'p1' }, body: {} };
    const res = mockRes();
    await editPunchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockEditPunch).not.toHaveBeenCalled();
  });

  it('returns 200 on successful edit with updated data', async () => {
    const updated = {
      id: 'p1',
      punchIn: '2024-01-15T09:00:00Z',
      punchOut: '2024-01-15T18:00:00Z',
    };
    mockEditPunch.mockResolvedValueOnce(updated);
    const req = {
      params: { punchId: 'p1' },
      body: { punchIn: '2024-01-15T09:00:00Z' },
    };
    const res = mockRes();
    await editPunchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Punch updated successfully', id: 'p1' }),
    );
  });

  it('accepts punchOut alone as a valid edit', async () => {
    mockEditPunch.mockResolvedValueOnce({ id: 'p1' });
    const req = {
      params: { punchId: 'p1' },
      body: { punchOut: '2024-01-15T18:00:00Z' },
    };
    const res = mockRes();
    await editPunchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockEditPunch).toHaveBeenCalledWith('p1', {
      punchIn: undefined,
      punchOut: '2024-01-15T18:00:00Z',
    });
  });

  it('returns 404 when punch record is not found', async () => {
    mockEditPunch.mockRejectedValueOnce(new Error('Punch record not found'));
    const req = {
      params: { punchId: 'ghost' },
      body: { punchOut: '2024-01-15T18:00:00Z' },
    };
    const res = mockRes();
    await editPunchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on other service errors', async () => {
    mockEditPunch.mockRejectedValueOnce(new Error('Compute failed'));
    const req = {
      params: { punchId: 'p1' },
      body: { punchIn: '2024-01-15T09:00:00Z' },
    };
    const res = mockRes();
    await editPunchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── deletePunchHandler ──────────────────────────────────────────────────────

describe('deletePunchHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with deleted:true on success', async () => {
    mockDeletePunch.mockResolvedValueOnce({ id: 'p1', deleted: true });
    const req = { params: { punchId: 'p1' } };
    const res = mockRes();
    await deletePunchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Punch deleted successfully', id: 'p1', deleted: true }),
    );
    expect(mockDeletePunch).toHaveBeenCalledWith('p1');
  });

  it('returns 404 when punch record is not found', async () => {
    mockDeletePunch.mockRejectedValueOnce(new Error('Punch record not found'));
    const req = { params: { punchId: 'ghost' } };
    const res = mockRes();
    await deletePunchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on other service errors', async () => {
    mockDeletePunch.mockRejectedValueOnce(new Error('Unexpected error'));
    const req = { params: { punchId: 'p1' } };
    const res = mockRes();
    await deletePunchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── assignScheduleHandler ────────────────────────────────────────────────────

describe('assignScheduleHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with updated user data on success', async () => {
    const updated = {
      uid: 'u1',
      schedule: { start: '09:00', end: '18:00' },
      timezone: 'Asia/Manila',
    };
    mockAssignSchedule.mockResolvedValueOnce(updated);
    const req = {
      params: { uid: 'u1' },
      body: { schedule: { start: '09:00', end: '18:00' }, timezone: 'Asia/Manila' },
    };
    const res = mockRes();
    await assignScheduleHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Schedule updated successfully', uid: 'u1' }),
    );
    expect(mockAssignSchedule).toHaveBeenCalledWith('u1', {
      schedule: { start: '09:00', end: '18:00' },
      timezone: 'Asia/Manila',
    });
  });

  it('returns 404 when user is not found', async () => {
    mockAssignSchedule.mockRejectedValueOnce(new Error('User not found'));
    const req = { params: { uid: 'ghost' }, body: { schedule: { start: '08:00', end: '17:00' } } };
    const res = mockRes();
    await assignScheduleHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 on validation errors (missing fields)', async () => {
    mockAssignSchedule.mockRejectedValueOnce(
      new Error('Provide at least one of schedule or timezone to update'),
    );
    const req = { params: { uid: 'u1' }, body: {} };
    const res = mockRes();
    await assignScheduleHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─── dailyReportHandler ───────────────────────────────────────────────────────

describe('dailyReportHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with employee KPI rows for a supplied date', async () => {
    const report = [
      {
        uid: 'u1',
        workDate: '2024-01-15',
        regularHours: 9,
        overtimeHours: 0,
        nightDiffHours: 0,
        lateMinutes: 0,
        undertimeMinutes: 0,
        employee: { firstName: 'Alice', lastName: 'Smith' },
      },
    ];
    mockGetAllDailyReports.mockResolvedValueOnce(report);
    const req = { query: { date: '2024-01-15' } };
    const res = mockRes();
    await dailyReportHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ date: '2024-01-15', count: 1, data: report });
    expect(mockGetAllDailyReports).toHaveBeenCalledWith('2024-01-15');
  });

  it('defaults to today (UTC) when no date query param is supplied', async () => {
    mockGetAllDailyReports.mockResolvedValueOnce([]);
    const req = { query: {} };
    const res = mockRes();
    await dailyReportHandler(req, res);
    const today = new Date().toISOString().slice(0, 10);
    expect(mockGetAllDailyReports).toHaveBeenCalledWith(today);
    expect(res.json).toHaveBeenCalledWith({ date: today, count: 0, data: [] });
  });

  it('returns 200 with count: 0 when no employees worked that day', async () => {
    mockGetAllDailyReports.mockResolvedValueOnce([]);
    const req = { query: { date: '2024-01-01' } };
    const res = mockRes();
    await dailyReportHandler(req, res);
    expect(res.json).toHaveBeenCalledWith({ date: '2024-01-01', count: 0, data: [] });
  });

  it('returns 500 on service error', async () => {
    mockGetAllDailyReports.mockRejectedValueOnce(new Error('DB error'));
    const req = { query: { date: '2024-01-15' } };
    const res = mockRes();
    await dailyReportHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── weeklyReportHandler ──────────────────────────────────────────────────────

describe('weeklyReportHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with weekly report for a supplied date range', async () => {
    const report = [{ uid: 'u1', totals: { regularHours: 45 }, days: [] }];
    mockGetAllWeeklyReports.mockResolvedValueOnce(report);
    const req = { query: { startDate: '2024-01-15', endDate: '2024-01-21' } };
    const res = mockRes();
    await weeklyReportHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      startDate: '2024-01-15',
      endDate: '2024-01-21',
      count: 1,
      data: report,
    });
    expect(mockGetAllWeeklyReports).toHaveBeenCalledWith('2024-01-15', '2024-01-21');
  });

  it('auto-computes current Mon–Sun when no date range is supplied', async () => {
    mockGetAllWeeklyReports.mockResolvedValueOnce([]);
    const req = { query: {} };
    const res = mockRes();
    await weeklyReportHandler(req, res);
    // Must call service with two valid YYYY-MM-DD strings
    expect(mockGetAllWeeklyReports).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on service error', async () => {
    mockGetAllWeeklyReports.mockRejectedValueOnce(new Error('DB error'));
    const req = { query: { startDate: '2024-01-15', endDate: '2024-01-21' } };
    const res = mockRes();
    await weeklyReportHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
