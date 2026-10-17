import { describe, expect, it } from 'vitest';
import {
    academyDateKey, academyDateTime, academyParts, academyTimeLabel, academyWeekday, addAcademyDays,
} from './academyTime';

// Assertions are written against UTC instants so they hold under any TZ (run also with TZ=UTC / TZ=America/New_York).
describe('academy clock', () => {
    it('reads instants on UTC+08:00 regardless of the device timezone', () => {
        expect(academyParts('2026-10-20T01:00:00Z')).toEqual({ year: 2026, month: 10, day: 20, hour: 9, minute: 0, weekday: 2 });
        expect(academyDateKey('2026-10-19T16:30:00Z')).toBe('2026-10-20');
        expect(academyTimeLabel('2026-10-19T16:30:00Z')).toBe('00:30');
        expect(academyWeekday('2026-10-19T16:30:00Z')).toBe('周二');
        expect(academyParts('not a date')).toBeNull();
        expect(academyDateKey('')).toBe('');
    });

    it('composes academy wall-clock input into the right instant', () => {
        expect(academyDateTime('2026-10-20', '09:00').toISOString()).toBe('2026-10-20T01:00:00.000Z');
        expect(academyDateTime('2026-10-20', '0:15').toISOString()).toBe('2026-10-19T16:15:00.000Z');
        expect(academyDateTime('2026-02-30', '09:00')).toBeNull();
        expect(academyDateTime('2026-10-20', '24:00')).toBeNull();
        expect(academyDateTime('20261020', '09:00')).toBeNull();
    });

    it('adds whole academy days', () => {
        expect(addAcademyDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addAcademyDays('2026-03-01', -1)).toBe('2026-02-28');
        expect(addAcademyDays('bad', 1)).toBe('');
    });
});
