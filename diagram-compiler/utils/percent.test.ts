import { describe, expect, it } from 'vitest';
import { clampPercent, remainingPercentFromUsedPercent, sumClampedPercents } from './percent';

describe('percent utils', () => {
  describe('clampPercent', () => {
    it('clamps finite numbers into [0..100]', () => {
      expect(clampPercent(-10)).toBe(0);
      expect(clampPercent(0)).toBe(0);
      expect(clampPercent(12.5)).toBe(12.5);
      expect(clampPercent(100)).toBe(100);
      expect(clampPercent(150)).toBe(100);
    });

    it('returns null for non-finite values', () => {
      expect(clampPercent(NaN)).toBeNull();
      expect(clampPercent(Infinity)).toBeNull();
      expect(clampPercent(-Infinity)).toBeNull();
      expect(clampPercent('50')).toBeNull();
      expect(clampPercent(null)).toBeNull();
      expect(clampPercent(undefined)).toBeNull();
    });
  });

  describe('remainingPercentFromUsedPercent', () => {
    it('converts used% to remaining%', () => {
      expect(remainingPercentFromUsedPercent(0)).toBe(100);
      expect(remainingPercentFromUsedPercent(20)).toBe(80);
      expect(remainingPercentFromUsedPercent(100)).toBe(0);
    });

    it('clamps out-of-range used% before converting', () => {
      expect(remainingPercentFromUsedPercent(-1)).toBe(100);
      expect(remainingPercentFromUsedPercent(101)).toBe(0);
    });

    it('returns null for invalid inputs', () => {
      expect(remainingPercentFromUsedPercent(NaN)).toBeNull();
      expect(remainingPercentFromUsedPercent('50')).toBeNull();
    });
  });

  describe('sumClampedPercents', () => {
    it('sums only numeric finite percents (clamped)', () => {
      expect(sumClampedPercents([10, 20, null, undefined, '30', NaN, -5, 110])).toEqual({ sum: 130, count: 4 });
    });
  });
});
