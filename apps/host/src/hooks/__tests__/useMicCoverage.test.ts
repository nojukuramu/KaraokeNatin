/**
 * Pure scoring-logic tests for mic-coverage karaoke scoring.
 *
 * `coverageToScore` deliberately has no Web Audio / getUserMedia
 * dependency, so it's tested directly without mocking any browser APIs.
 */
import { describe, it, expect } from 'vitest';
import { coverageToScore, FULL_COVERAGE_THRESHOLD } from '../useMicCoverage';

describe('coverageToScore', () => {
    it('scores zero coverage at the floor, not zero', () => {
        const score = coverageToScore(0);
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThan(20);
    });

    it('maps ~0.5 coverage to ~50', () => {
        const score = coverageToScore(0.5);
        expect(score).toBe(50);
    });

    it('tracks coverage roughly linearly below the full-coverage threshold', () => {
        expect(coverageToScore(0.2)).toBe(20);
        expect(coverageToScore(0.35)).toBe(35);
        expect(coverageToScore(0.6)).toBe(60);
        expect(coverageToScore(0.75)).toBe(75);
    });

    it('randomizes into the 90-100 band at/above the full-coverage threshold', () => {
        for (let i = 0; i < 50; i++) {
            const score = coverageToScore(FULL_COVERAGE_THRESHOLD);
            expect(score).toBeGreaterThanOrEqual(90);
            expect(score).toBeLessThanOrEqual(100);
        }
    });

    it('randomizes into the 90-100 band for full (1.0) coverage', () => {
        for (let i = 0; i < 50; i++) {
            const score = coverageToScore(1);
            expect(score).toBeGreaterThanOrEqual(90);
            expect(score).toBeLessThanOrEqual(100);
        }
    });

    it('stays just below the 90-100 band right under the threshold', () => {
        const justUnder = FULL_COVERAGE_THRESHOLD - 0.01;
        const score = coverageToScore(justUnder);
        expect(score).toBe(Math.round(justUnder * 100));
        expect(score).toBeLessThan(90);
    });

    it('clamps out-of-range coverage instead of producing nonsense scores', () => {
        expect(coverageToScore(-1)).toBeGreaterThanOrEqual(0);
        expect(coverageToScore(-0.5)).toBe(coverageToScore(0));
        expect(coverageToScore(1.5)).toBeGreaterThanOrEqual(90);
        expect(coverageToScore(2)).toBeLessThanOrEqual(100);
    });

    it('treats non-finite input as zero coverage rather than throwing', () => {
        // NaN/Infinity aren't valid fractions - fail safe to "no coverage
        // measured" rather than guessing a high score from bad data.
        expect(() => coverageToScore(NaN)).not.toThrow();
        expect(coverageToScore(NaN)).toBe(coverageToScore(0));
        expect(coverageToScore(Infinity)).toBe(coverageToScore(0));
        expect(coverageToScore(-Infinity)).toBe(coverageToScore(0));
    });

    it('never returns a score outside [0, 100]', () => {
        const samples = [0, 0.01, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.89, 0.9, 0.95, 1, -1, 2, NaN];
        for (const coverage of samples) {
            for (let i = 0; i < 5; i++) {
                const score = coverageToScore(coverage);
                expect(score).toBeGreaterThanOrEqual(0);
                expect(score).toBeLessThanOrEqual(100);
            }
        }
    });
});
