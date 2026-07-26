import { describe, it, expect } from 'vitest';
import { formatClock } from '../ControlPanel';

describe('formatClock', () => {
    it('formats whole minutes and seconds', () => {
        expect(formatClock(0)).toBe('0:00');
        expect(formatClock(5)).toBe('0:05');
        expect(formatClock(65)).toBe('1:05');
        expect(formatClock(600)).toBe('10:00');
    });

    it('truncates fractional seconds rather than rounding up', () => {
        // The player reports fractional time; showing 0:10 while the bar sits
        // just short of 10s would look like an off-by-one to the user.
        expect(formatClock(9.99)).toBe('0:09');
    });

    it('always pads seconds to two digits', () => {
        expect(formatClock(61)).toBe('1:01');
        expect(formatClock(119)).toBe('1:59');
    });

    it('does not run past 59 minutes into a broken format', () => {
        expect(formatClock(3600)).toBe('60:00');
    });

    it('degrades safely on invalid input', () => {
        expect(formatClock(-1)).toBe('0:00');
        expect(formatClock(NaN)).toBe('0:00');
        expect(formatClock(Infinity)).toBe('0:00');
    });
});
