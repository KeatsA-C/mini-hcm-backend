import { describe, it, expect } from '@jest/globals';
import { computeMetrics } from '../../src/lib/computeHours.js';

const SCHED = { start: '09:00', end: '18:00' };

function compute(piISO, poISO, schedule = SCHED) {
  return computeMetrics({
    punchIn: new Date(piISO),
    punchOut: new Date(poISO),
    schedule,
  });
}

//  workDate

describe('computeMetrics  workDate', () => {
  it('Manila date of punchIn becomes workDate', () => {
    // 09:00 Manila Jan 15 = 01:00 UTC Jan 15
    const r = compute('2024-01-15T01:00:00Z', '2024-01-15T10:00:00Z');
    expect(r.workDate).toBe('2024-01-15');
  });

  it('punchIn at 00:30 Manila (16:30 UTC prev day)  workDate is Manila date', () => {
    // 00:30 Manila Jan 16 = 16:30 UTC Jan 15
    const r = compute('2024-01-15T16:30:00Z', '2024-01-15T22:00:00Z');
    expect(r.workDate).toBe('2024-01-16');
  });
});

//  Exact schedule

describe('computeMetrics  exact schedule (09:0018:00 Manila)', () => {
  it('9 regular, 0 OT, 0 ND, 0 late, 0 undertime, totalWorked=9', () => {
    // 09:0018:00 Manila = 01:0010:00 UTC
    const r = compute('2024-01-15T01:00:00Z', '2024-01-15T10:00:00Z');
    expect(r.regularHours).toBe(9);
    expect(r.overtimeHours).toBe(0);
    expect(r.nightDiffHours).toBe(0);
    expect(r.lateMinutes).toBe(0);
    expect(r.undertimeMinutes).toBe(0);
    expect(r.totalWorkedHours).toBe(9);
  });
});

//  Late arrival

describe('computeMetrics  late arrival', () => {
  it('30 min late  lateMinutes=30, regularHours=8.5, totalWorked=8.5', () => {
    // 09:3018:00 Manila = 01:3010:00 UTC
    const r = compute('2024-01-15T01:30:00Z', '2024-01-15T10:00:00Z');
    expect(r.lateMinutes).toBe(30);
    expect(r.regularHours).toBe(8.5);
    expect(r.overtimeHours).toBe(0);
    expect(r.totalWorkedHours).toBe(8.5);
  });

  it('60 min late  lateMinutes=60, regularHours=8', () => {
    // 10:0018:00 Manila = 02:0010:00 UTC
    const r = compute('2024-01-15T02:00:00Z', '2024-01-15T10:00:00Z');
    expect(r.lateMinutes).toBe(60);
    expect(r.regularHours).toBe(8);
  });

  it('early punch-in is NOT counted  totalWorked = regular + OT only', () => {
    // 08:4718:00 Manila = 00:4710:00 UTC
    // early: 13 min pre-schedule (not counted anywhere)
    // regular: 09:0018:00 = 9h, OT: 0, total = 9h (not 9.22h)
    const r = compute('2024-01-15T00:47:00Z', '2024-01-15T10:00:00Z');
    expect(r.lateMinutes).toBe(0);
    expect(r.regularHours).toBe(9);
    expect(r.overtimeHours).toBe(0);
    expect(r.totalWorkedHours).toBe(9);
  });
});

//  Undertime

describe('computeMetrics  undertime', () => {
  it('30 min undertime  undertimeMinutes=30, regularHours=8.5', () => {
    // 09:0017:30 Manila = 01:0009:30 UTC
    const r = compute('2024-01-15T01:00:00Z', '2024-01-15T09:30:00Z');
    expect(r.undertimeMinutes).toBe(30);
    expect(r.regularHours).toBe(8.5);
    expect(r.lateMinutes).toBe(0);
    expect(r.overtimeHours).toBe(0);
  });

  it('punch out exactly at schedStart  9h undertime, 0 regular', () => {
    // 09:0009:00 Manila = 01:0001:00 UTC
    const r = compute('2024-01-15T01:00:00Z', '2024-01-15T01:00:00Z');
    expect(r.undertimeMinutes).toBe(540);
    expect(r.regularHours).toBe(0);
  });
});

//  Overtime

describe('computeMetrics  overtime', () => {
  it('2h OT  punch out 20:00 Manila (12:00 UTC)', () => {
    // 09:0020:00 Manila = 01:0012:00 UTC
    const r = compute('2024-01-15T01:00:00Z', '2024-01-15T12:00:00Z');
    expect(r.regularHours).toBe(9);
    expect(r.overtimeHours).toBe(2);
    expect(r.lateMinutes).toBe(0);
    expect(r.undertimeMinutes).toBe(0);
    expect(r.totalWorkedHours).toBe(11); // regular + OT
  });

  it('totalWorkedHours always equals regularHours + overtimeHours', () => {
    const r = compute('2024-01-15T01:00:00Z', '2024-01-15T12:00:00Z');
    expect(r.totalWorkedHours).toBe(r.regularHours + r.overtimeHours);
  });

  it('punchIn & punchOut both after schedEnd (1-second gap)  0 regular, 0 OT', () => {
    // 23:28:2723:28:28 Manila = 15:28:2715:28:28 UTC
    const r = compute('2024-01-15T15:28:27Z', '2024-01-15T15:28:28Z');
    expect(r.overtimeHours).toBe(0);
    expect(r.regularHours).toBe(0);
    expect(r.totalWorkedHours).toBe(0);
  });

  it('punchIn entirely in OT zone  OT = full duration, 0 regular', () => {
    // 20:0022:00 Manila = 12:0014:00 UTC
    const r = compute('2024-01-15T12:00:00Z', '2024-01-15T14:00:00Z');
    expect(r.regularHours).toBe(0);
    expect(r.overtimeHours).toBe(2);
    expect(r.totalWorkedHours).toBe(2);
  });
});

//  Night Differential

describe('computeMetrics  night differential', () => {
  it('1h ND  09:0023:00 Manila (window 22:0023:00 Manila)', () => {
    // 01:0015:00 UTC  |  ND: 14:0015:00 UTC = 1h  |  OT: 5h
    const r = compute('2024-01-15T01:00:00Z', '2024-01-15T15:00:00Z');
    expect(r.nightDiffHours).toBe(1);
    expect(r.overtimeHours).toBe(5);
  });

  it('4h ND  graveyard 02:0006:00 Manila (inside prior-night window)', () => {
    // 02:00 Manila Jan 15 = 18:00 UTC Jan 14
    // 06:00 Manila Jan 15 = 22:00 UTC Jan 14
    // ND window: 22:00 Manila Jan 14  06:00 Manila Jan 15 = 14:0022:00 UTC Jan 14
    const r = compute('2024-01-14T18:00:00Z', '2024-01-14T22:00:00Z');
    expect(r.nightDiffHours).toBe(4);
    expect(r.workDate).toBe('2024-01-15');
  });

  it('6h ND  00:0006:00 Manila (entire span inside ND window)', () => {
    // 00:00 Manila Jan 15 = 16:00 UTC Jan 14
    // 06:00 Manila Jan 15 = 22:00 UTC Jan 14
    const r = compute('2024-01-14T16:00:00Z', '2024-01-14T22:00:00Z');
    expect(r.nightDiffHours).toBe(6);
  });

  it('multi-day punchOut is capped to end of workDate Manila (07:00 Jan 15 Manila in, Jan 18 Manila out)', () => {
    // punchIn:  07:00 Manila Jan 15 = 23:00 UTC Jan 14  → workDate = '2024-01-15'
    // punchOut: 01:00 Manila Jan 18 = 17:00 UTC Jan 17  → capped to 23:59:59.999 Manila Jan 15 = 15:59:59.999 UTC Jan 15
    // Effective window: 23:00 UTC Jan 14 → 15:59:59.999 UTC Jan 15
    // ND windows:
    //   Jan 14 night: UTC [Jan 14 14:00, Jan 14 22:00]  — piMs (Jan 14 23:00) > windowEnd → 0h
    //   Jan 15 night: UTC [Jan 15 14:00, Jan 15 22:00]  — overlap([Jan 14 23:00, Jan 15 15:59:59.999]) → 2h
    // regular: piMs before schedStart (Jan15 01:00 UTC) → 9h; OT: ≈6h; total=15
    const r = compute('2024-01-14T23:00:00Z', '2024-01-17T17:00:00Z');
    expect(r.workDate).toBe('2024-01-15');
    expect(r.nightDiffHours).toBe(2);
    expect(r.regularHours).toBe(9);
    expect(r.overtimeHours).toBe(6);
    expect(r.totalWorkedHours).toBe(15);
  });

  it('16:0002:00 Manila punchOut capped at Manila midnight  2h ND', () => {
    // punchIn  16:00 Manila Jan 15 = 08:00 UTC Jan 15  → workDate = '2024-01-15'
    // punchOut 02:00 Manila Jan 16 = 18:00 UTC Jan 15  → capped to 23:59:59.999 Manila Jan 15 = 15:59:59.999 UTC Jan 15
    // lateMinutes: piMs(08:00) - schedStart(01:00) = 7h = 420 min
    // regular: overlap([08:00, 15:59:59.999], [01:00, 10:00]) = [08:00, 10:00] = 2h
    // OT: max(0, 15:59:59.999 - max(08:00, 10:00)) = 15:59:59.999 - 10:00 ≈ 6h
    // ND window Jan 15 night: UTC [Jan 15 14:00, Jan 15 22:00]
    // overlap([08:00, 15:59:59.999], [14:00, 22:00]) = [14:00, 15:59:59.999] ≈ 2h
    const r = compute('2024-01-15T08:00:00Z', '2024-01-15T18:00:00Z');
    expect(r.workDate).toBe('2024-01-15');
    expect(r.lateMinutes).toBe(420);
    expect(r.regularHours).toBe(2);
    expect(r.overtimeHours).toBe(6);
    expect(r.nightDiffHours).toBe(2);
    expect(r.totalWorkedHours).toBe(8);
  });
});

//  Combined scenarios

describe('computeMetrics  combined scenarios', () => {
  it('15 min late + 4.5h OT + 0.5h ND', () => {
    // 09:1522:30 Manila = 01:1514:30 UTC
    const r = compute('2024-01-15T01:15:00Z', '2024-01-15T14:30:00Z');
    expect(r.lateMinutes).toBe(15);
    expect(r.undertimeMinutes).toBe(0);
    expect(r.regularHours).toBe(8.75);
    expect(r.overtimeHours).toBe(4.5);
    expect(r.nightDiffHours).toBe(0.5);
    expect(r.totalWorkedHours).toBe(13.25);
  });

  it('late AND undertime  6h worked inside schedule, 0 OT, 0 ND', () => {
    // 10:0016:00 Manila = 02:0008:00 UTC
    const r = compute('2024-01-15T02:00:00Z', '2024-01-15T08:00:00Z');
    expect(r.lateMinutes).toBe(60);
    expect(r.undertimeMinutes).toBe(120);
    expect(r.regularHours).toBe(6);
    expect(r.overtimeHours).toBe(0);
    expect(r.nightDiffHours).toBe(0);
    expect(r.totalWorkedHours).toBe(6);
  });

  it('early in + OT  totalWorked = regular + OT, early minutes excluded', () => {
    // 08:4720:00 Manila = 00:4712:00 UTC
    // early: 13 min (not counted); regular: 9h; OT: 2h; total: 11h
    const r = compute('2024-01-15T00:47:00Z', '2024-01-15T12:00:00Z');
    expect(r.regularHours).toBe(9);
    expect(r.overtimeHours).toBe(2);
    expect(r.totalWorkedHours).toBe(11);
    expect(r.lateMinutes).toBe(0);
  });
});
