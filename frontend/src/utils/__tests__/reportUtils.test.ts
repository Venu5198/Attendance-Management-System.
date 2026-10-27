import { describe, it, expect } from 'vitest';
import { formatISTTime, formatISTDate, classifyDailyRecord, getPolicyBreakdown } from '../reportUtils';
import type { DailyAttendanceItem } from '../../types';

describe('reportUtils', () => {
  describe('formatISTTime', () => {
    it('returns "—" when timestamp is null or undefined', () => {
      expect(formatISTTime(null)).toBe('—');
      expect(formatISTTime(undefined)).toBe('—');
    });

    it('formats UTC ISO timestamp into Asia/Kolkata (IST) 12-hour format', () => {
      // 04:00 UTC = 09:30 AM IST (UTC+5:30)
      const formatted = formatISTTime('2026-10-26T04:00:00Z');
      expect(formatted).toContain('IST');
      expect(formatted).toMatch(/09:30\s*(AM|am)/i);
    });
  });

  describe('formatISTDate', () => {
    it('returns "—" when date is null or undefined', () => {
      expect(formatISTDate(null)).toBe('—');
      expect(formatISTDate(undefined)).toBe('—');
    });

    it('formats YYYY-MM-DD into readable date in Asia/Kolkata', () => {
      const formatted = formatISTDate('2026-10-24');
      expect(formatted).toContain('2026');
      expect(formatted).toContain('Oct');
      expect(formatted).toContain('24');
    });
  });

  describe('classifyDailyRecord', () => {
    it('classifies completed record with duration >= 0.05h as QUALIFYING', () => {
      const item: DailyAttendanceItem = {
        work_date: '2026-10-20',
        entry_time: '2026-10-20T04:00:00Z',
        exit_time: '2026-10-20T10:00:00Z',
        duration_seconds: 21600,
        duration_hours: 6.0,
        status: 'COMPLETED',
      };
      const result = classifyDailyRecord(item);
      expect(result.state).toBe('QUALIFYING');
      expect(result.isQualifying).toBe(true);
      expect(result.isAnomaly).toBe(false);
      expect(result.label).toContain('Attended (Qualifying)');
    });

    it('classifies zero-duration completed record (e.g. 7s / 0.0h) as ZERO_DURATION anomaly', () => {
      const item: DailyAttendanceItem = {
        work_date: '2026-10-24',
        entry_time: '2026-10-24T05:00:00Z',
        exit_time: '2026-10-24T05:00:07Z',
        duration_seconds: 7,
        duration_hours: 0.0,
        status: 'COMPLETED',
      };
      const result = classifyDailyRecord(item);
      expect(result.state).toBe('ZERO_DURATION');
      expect(result.isQualifying).toBe(false);
      expect(result.isAnomaly).toBe(true);
      expect(result.label).toContain('0.0h Logged (Non-qualifying)');
    });

    it('classifies past unclosed in-progress record as INCOMPLETE_STALE anomaly', () => {
      const item: DailyAttendanceItem = {
        work_date: '2026-10-01',
        entry_time: '2026-10-01T04:00:00Z',
        exit_time: null,
        duration_seconds: 0,
        duration_hours: 0.0,
        status: 'IN_PROGRESS',
      };
      const result = classifyDailyRecord(item);
      expect(result.state).toBe('INCOMPLETE_STALE');
      expect(result.isAnomaly).toBe(true);
      expect(result.label).toContain('Incomplete');
    });

    it('classifies not attended day as NOT_ATTENDED', () => {
      const item: DailyAttendanceItem = {
        work_date: '2026-10-22',
        entry_time: null,
        exit_time: null,
        duration_seconds: 0,
        duration_hours: 0.0,
        status: 'NOT_ATTENDED',
      };
      const result = classifyDailyRecord(item);
      expect(result.state).toBe('NOT_ATTENDED');
      expect(result.isQualifying).toBe(false);
      expect(result.isAnomaly).toBe(false);
    });
  });

  describe('getPolicyBreakdown', () => {
    it('evaluates both targets met as COMPLIANT', () => {
      const breakdown = getPolicyBreakdown(3, 16.5);
      expect(breakdown.complianceState).toBe('COMPLIANT');
      expect(breakdown.meetsDays).toBe(true);
      expect(breakdown.meetsHours).toBe(true);
      expect(breakdown.bothMet).toBe(true);
      expect(breakdown.daysRemaining).toBe(0);
      expect(breakdown.hoursRemaining).toBe(0);
    });

    it('evaluates met days but pending hours as HOURS_PENDING', () => {
      const breakdown = getPolicyBreakdown(3, 10.0);
      expect(breakdown.complianceState).toBe('HOURS_PENDING');
      expect(breakdown.meetsDays).toBe(true);
      expect(breakdown.meetsHours).toBe(false);
      expect(breakdown.hoursRemaining).toBe(5.0);
    });

    it('evaluates met hours but pending days as DAYS_PENDING', () => {
      const breakdown = getPolicyBreakdown(2, 16.0);
      expect(breakdown.complianceState).toBe('DAYS_PENDING');
      expect(breakdown.meetsDays).toBe(false);
      expect(breakdown.meetsHours).toBe(true);
      expect(breakdown.daysRemaining).toBe(1);
    });

    it('evaluates neither target met as BOTH_PENDING', () => {
      const breakdown = getPolicyBreakdown(1, 4.5);
      expect(breakdown.complianceState).toBe('BOTH_PENDING');
      expect(breakdown.daysRemaining).toBe(2);
      expect(breakdown.hoursRemaining).toBe(10.5);
    });

    it('respects confirmed NON_COMPLIANT overall status', () => {
      const breakdown = getPolicyBreakdown(1, 4.5, 'NON_COMPLIANT');
      expect(breakdown.complianceState).toBe('NON_COMPLIANT');
      expect(breakdown.statusBadgeText).toContain('Non-Compliant');
    });
  });
});
