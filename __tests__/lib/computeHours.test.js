import { describe, it, expect } from '@jest/globals';
import { computeMetrics } from '../../src/lib/computeHours.js';

const SCHEDULE = { start: '09:00', end: '18:00' };
const TZ = 'UTC';

// Helper so tests stay concise
function compute(punchInISO, punchOutISO, schedule = SCHEDULE, timezone = TZ) {
  return computeMetrics({
    punchIn: new Date(punchInISO),
    punchOut: new Date(punchOutISO),
    schedule,
    timezone,
  });
}

describe('computeMetrics – workDate', () => {
  it('assigns workDate from the local date of punchIn', () => {
    const r = compute('2024-03-20T14:00:00Z', '2024-03-20T18:00:00Z');
    expect(r.workDate).toBe('2024-03-20');
  });
});

describe('computeMetrics – exact schedule (09:00-18:00, UTC)', () => {
  it('9 regular hours, 0 OT, 0 ND, 0 late, 0 undertime', () => {
    const r = compute('2024-01-15T09:00:00Z', '2024-01-15T18:00:00Z');
    expect(r.regularHours).toBe(9);
    expect(r.overtimeHours).toBe(0);
    expect(r.nightDiffHours).toBe(0);
    expect(r.lateMinutes).toBe(0);
    expect(r.undertimeMinutes).toBe(0);
    expect(r.totalWorkedHours).toBe(9);
  });
});

describe('computeMetrics – late arrival', () => {
  it('30 min late → lateMinutes=30, regularHours=8.5', () => {
    const r = compute('2024-01-15T09:30:00Z', '2024-01-15T18:00:00Z');
    expect(r.lateMinutes).toBe(30);
    expect(r.regularHours).toBe(8.5);
    expect(r.undertimeMinutes).toBe(0);
    expect(r.overtimeHours).toBe(0);
  });

  it('60 min late → lateMinutes=60, regularHours=8', () => {
    const r = compute('2024-01-15T10:00:00Z', '2024-01-15T18:00:00Z');
    expect(r.lateMinutes).toBe(60);
    expect(r.regularHours).toBe(8);
  });
});

describe('computeMetrics – undertime', () => {
  it('30 min undertime → undertimeMinutes=30, regularHours=8.5', () => {
    const r = compute('2024-01-15T09:00:00Z', '2024-01-15T17:30:00Z');
    expect(r.undertimeMinutes).toBe(30);
    expect(r.regularHours).toBe(8.5);
    expect(r.lateMinutes).toBe(0);
    expect(r.overtimeHours).toBe(0);
  });

  it('punching out at schedStart → 9h undertime, 0 regular hours', () => {
    const r = compute('2024-01-15T09:00:00Z', '2024-01-15T09:00:00Z');
    expect(r.undertimeMinutes).toBe(540); // 9 * 60
    expect(r.regularHours).toBe(0);
  });
});

describe('computeMetrics – overtime', () => {
  it('2h overtime (punch out at 20:00)', () => {
    const r = compute('2024-01-15T09:00:00Z', '2024-01-15T20:00:00Z');
    expect(r.overtimeHours).toBe(2);
    expect(r.regularHours).toBe(9);
    expect(r.lateMinutes).toBe(0);
    expect(r.undertimeMinutes).toBe(0);
  });

  it('totalWorkedHours = regularHours + overtimeHours', () => {
    const r = compute('2024-01-15T09:00:00Z', '2024-01-15T20:00:00Z');
    expect(r.totalWorkedHours).toBe(r.regularHours + r.overtimeHours);
  });
});

describe('computeMetrics – night differential', () => {
  it('1h ND when working 09:00–23:00 (ND window 22:00–23:00)', () => {
    const r = compute('2024-01-15T09:00:00Z', '2024-01-15T23:00:00Z');
    expect(r.nightDiffHours).toBe(1); // 22:00–23:00
    expect(r.overtimeHours).toBe(5); // 18:00–23:00
  });

  it('4h ND for a graveyard shift 02:00–06:00 (all within prior-day ND window)', () => {
    // ndA = 2024-01-14T22:00 – 2024-01-15T06:00
    // overlap(02:00_15, 06:00_15) = 4h
    const r = compute('2024-01-15T02:00:00Z', '2024-01-15T06:00:00Z');
    expect(r.nightDiffHours).toBe(4);
  });

  it('6h ND for midnight–06:00 punch (entire range inside ND window)', () => {
    const r = compute('2024-01-15T00:00:00Z', '2024-01-15T06:00:00Z');
    expect(r.nightDiffHours).toBe(6);
  });
});

describe('computeMetrics – combined scenarios', () => {
  it('15 min late + 4.5h OT + 0.5h ND', () => {
    // punchIn 09:15, punchOut 22:30
    // late: 15 min
    // regular: 09:15–18:00 = 8.75h
    // OT: 18:00–22:30 = 4.5h
    // ND: 22:00–22:30 = 0.5h
    const r = compute('2024-01-15T09:15:00Z', '2024-01-15T22:30:00Z');
    expect(r.lateMinutes).toBe(15);
    expect(r.undertimeMinutes).toBe(0);
    expect(r.regularHours).toBe(8.75);
    expect(r.overtimeHours).toBe(4.5);
    expect(r.nightDiffHours).toBe(0.5);
  });

  it('late AND undertime — only 6h worked inside schedule', () => {
    // punchIn: 10:00 (+60 min late), punchOut: 16:00 (-120 min undertime)
    // regular = 10:00–16:00 = 6h
    const r = compute('2024-01-15T10:00:00Z', '2024-01-15T16:00:00Z');
    expect(r.lateMinutes).toBe(60);
    expect(r.undertimeMinutes).toBe(120);
    expect(r.regularHours).toBe(6);
    expect(r.overtimeHours).toBe(0);
    expect(r.nightDiffHours).toBe(0);
  });
});
