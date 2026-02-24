import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPunchIn = jest.fn();
const mockPunchOut = jest.fn();
const mockGetPunchStatus = jest.fn();
const mockCancelOpenPunch = jest.fn();
const mockGetAttendanceHistory = jest.fn();
const mockGetDailySummary = jest.fn();
const mockGetWeeklySummary = jest.fn();

jest.unstable_mockModule('../../../src/api/attendance/attendance.services.js', () => ({
  punchIn: mockPunchIn,
  punchOut: mockPunchOut,
  getPunchStatus: mockGetPunchStatus,
  cancelOpenPunch: mockCancelOpenPunch,
  getAttendanceHistory: mockGetAttendanceHistory,
  getDailySummary: mockGetDailySummary,
  getWeeklySummary: mockGetWeeklySummary,
}));

const {
  handlePunchIn,
  handlePunchOut,
  getPunchStatusHandler,
  cancelOpenPunchHandler,
  getHistory,
  getDailySummaryHandler,
  getWeeklySummaryHandler,
} = await import('../../../src/api/attendance/attendance.controller.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// ─── getPunchStatusHandler ────────────────────────────────────────────────────

describe('getPunchStatusHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with the punch status object', async () => {
    const status = { punchedIn: false, openPunch: null, todaySummary: null };
    mockGetPunchStatus.mockResolvedValueOnce(status);
    const req = { user: { uid: 'u1' } };
    const res = mockRes();
    await getPunchStatusHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(status);
  });

  it('returns 500 on service error', async () => {
    mockGetPunchStatus.mockRejectedValueOnce(new Error('DB error'));
    const req = { user: { uid: 'u1' } };
    const res = mockRes();
    await getPunchStatusHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── handlePunchIn ────────────────────────────────────────────────────────────

describe('handlePunchIn', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 201 on successful punch-in', async () => {
    mockPunchIn.mockResolvedValueOnce({ id: 'p1', punchIn: '2024-01-15T09:00:00Z' });
    const req = { user: { uid: 'u1' } };
    const res = mockRes();
    await handlePunchIn(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Punched in successfully', id: 'p1' }),
    );
  });

  it('returns 409 when user already has an open punch', async () => {
    mockPunchIn.mockRejectedValueOnce(new Error('You already have an open punch'));
    const req = { user: { uid: 'u1' } };
    const res = mockRes();
    await handlePunchIn(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 500 on unexpected service error', async () => {
    mockPunchIn.mockRejectedValueOnce(new Error('Firestore unavailable'));
    const req = { user: { uid: 'u1' } };
    const res = mockRes();
    await handlePunchIn(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── handlePunchOut ───────────────────────────────────────────────────────────

describe('handlePunchOut', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with metrics on successful punch-out', async () => {
    const result = {
      id: 'p1',
      punchOut: '2024-01-15T18:00:00Z',
      metrics: { regularHours: 9, overtimeHours: 0 },
    };
    mockPunchOut.mockResolvedValueOnce(result);
    const req = { user: { uid: 'u1' } };
    const res = mockRes();
    await handlePunchOut(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Punched out successfully', id: 'p1' }),
    );
  });

  it('returns 404 when no open punch exists', async () => {
    mockPunchOut.mockRejectedValueOnce(new Error('No open punch found'));
    const req = { user: { uid: 'u1' } };
    const res = mockRes();
    await handlePunchOut(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 500 on unexpected service error', async () => {
    mockPunchOut.mockRejectedValueOnce(new Error('User profile not found'));
    const req = { user: { uid: 'u1' } };
    const res = mockRes();
    await handlePunchOut(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── cancelOpenPunchHandler ───────────────────────────────────────────────────

describe('cancelOpenPunchHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 on successful cancellation', async () => {
    mockCancelOpenPunch.mockResolvedValueOnce({ id: 'p1', voided: true });
    const req = { user: { uid: 'u1' }, params: { attendanceId: 'p1' } };
    const res = mockRes();
    await cancelOpenPunchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Punch cancelled successfully.', id: 'p1' }),
    );
  });

  it('returns 404 when punch record is not found', async () => {
    mockCancelOpenPunch.mockRejectedValueOnce(new Error('Punch record not found.'));
    const req = { user: { uid: 'u1' }, params: { attendanceId: 'ghost' } };
    const res = mockRes();
    await cancelOpenPunchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 when punch belongs to a different user', async () => {
    mockCancelOpenPunch.mockRejectedValueOnce(
      new Error('Forbidden: This punch does not belong to you.'),
    );
    const req = { user: { uid: 'u1' }, params: { attendanceId: 'p99' } };
    const res = mockRes();
    await cancelOpenPunchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 409 when the punch is already completed', async () => {
    mockCancelOpenPunch.mockRejectedValueOnce(new Error('already completed'));
    const req = { user: { uid: 'u1' }, params: { attendanceId: 'p1' } };
    const res = mockRes();
    await cancelOpenPunchHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

// ─── getHistory ───────────────────────────────────────────────────────────────

describe('getHistory', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with records for a date range', async () => {
    const records = [{ id: 'p1' }, { id: 'p2' }];
    mockGetAttendanceHistory.mockResolvedValueOnce(records);
    const req = {
      user: { uid: 'u1' },
      query: { startDate: '2024-01-01', endDate: '2024-01-31' },
    };
    const res = mockRes();
    await getHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(records);
    expect(mockGetAttendanceHistory).toHaveBeenCalledWith('u1', {
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });
  });

  it('returns 500 on service error', async () => {
    mockGetAttendanceHistory.mockRejectedValueOnce(new Error('DB error'));
    const req = { user: { uid: 'u1' }, query: {} };
    const res = mockRes();
    await getHistory(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── getDailySummaryHandler ───────────────────────────────────────────────────

describe('getDailySummaryHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with the daily summary when found', async () => {
    const summary = {
      workDate: '2024-01-15',
      regularHours: 9,
      overtimeHours: 0,
      nightDiffHours: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
    };
    mockGetDailySummary.mockResolvedValueOnce(summary);
    const req = { user: { uid: 'u1' }, query: { date: '2024-01-15' } };
    const res = mockRes();
    await getDailySummaryHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(summary);
    expect(mockGetDailySummary).toHaveBeenCalledWith('u1', '2024-01-15');
  });

  it('returns 404 when no summary exists for that date', async () => {
    mockGetDailySummary.mockResolvedValueOnce(null);
    const req = { user: { uid: 'u1' }, query: { date: '2024-01-15' } };
    const res = mockRes();
    await getDailySummaryHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('defaults date to today (UTC) when not supplied in query', async () => {
    mockGetDailySummary.mockResolvedValueOnce({ workDate: '2024-01-15' });
    const req = { user: { uid: 'u1' }, query: {} };
    const res = mockRes();
    await getDailySummaryHandler(req, res);
    const today = new Date().toISOString().slice(0, 10);
    expect(mockGetDailySummary).toHaveBeenCalledWith('u1', today);
  });

  it('returns 500 on service error', async () => {
    mockGetDailySummary.mockRejectedValueOnce(new Error('DB error'));
    const req = { user: { uid: 'u1' }, query: { date: '2024-01-15' } };
    const res = mockRes();
    await getDailySummaryHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── getWeeklySummaryHandler ──────────────────────────────────────────────────

describe('getWeeklySummaryHandler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with weekly summary for a supplied date range', async () => {
    const summary = {
      uid: 'u1',
      startDate: '2024-01-15',
      endDate: '2024-01-21',
      totals: { regularHours: 45 },
      days: [],
    };
    mockGetWeeklySummary.mockResolvedValueOnce(summary);
    const req = {
      user: { uid: 'u1' },
      query: { startDate: '2024-01-15', endDate: '2024-01-21' },
    };
    const res = mockRes();
    await getWeeklySummaryHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(summary);
    expect(mockGetWeeklySummary).toHaveBeenCalledWith('u1', '2024-01-15', '2024-01-21');
  });

  it('auto-resolves Monday–Sunday when no date range supplied', async () => {
    mockGetWeeklySummary.mockResolvedValueOnce({ totals: {}, days: [] });
    const req = { user: { uid: 'u1' }, query: {} };
    const res = mockRes();
    await getWeeklySummaryHandler(req, res);
    expect(mockGetWeeklySummary).toHaveBeenCalledWith(
      'u1',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), // valid date string
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on service error', async () => {
    mockGetWeeklySummary.mockRejectedValueOnce(new Error('DB error'));
    const req = {
      user: { uid: 'u1' },
      query: { startDate: '2024-01-15', endDate: '2024-01-21' },
    };
    const res = mockRes();
    await getWeeklySummaryHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
