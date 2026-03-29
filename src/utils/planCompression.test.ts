import { describe, it, expect } from 'vitest';
import { compressPlan, previewCompression } from './planCompression';
import type { TrainingPlanTemplate, FitnessLevel } from '../types/training';

// Minimal 10-week plan template for testing
const make10WeekTemplate = (): TrainingPlanTemplate => ({
  id: 'test_10_week',
  name: 'Test 10-Week Plan',
  sportType: 'running',
  description: 'Test plan',
  duration: 10,
  methodology: 'polarized',
  goal: '10k' as any,
  fitnessLevel: 'intermediate',
  category: 'race_distance' as any,
  hoursPerWeek: { min: 4, max: 7 },
  weeklyTSS: { min: 200, max: 350 },
  phases: [
    { weeks: [1, 2, 3], phase: 'base', focus: 'Build aerobic base' },
    { weeks: [4], phase: 'recovery', focus: 'Recovery' },
    { weeks: [5, 6, 7], phase: 'build', focus: 'Add intensity' },
    { weeks: [8, 9], phase: 'peak', focus: 'Peak fitness' },
    { weeks: [10], phase: 'taper', focus: 'Taper for race' },
  ],
  weekTemplates: Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      i + 1,
      {
        sunday: { workout: null, notes: 'Rest' },
        monday: { workout: 'easy_run', notes: 'Easy' },
        tuesday: { workout: 'tempo_run', notes: 'Tempo' },
        wednesday: { workout: null, notes: 'Rest' },
        thursday: { workout: 'intervals', notes: 'Intervals' },
        friday: { workout: null, notes: 'Rest' },
        saturday: { workout: 'long_run', notes: 'Long' },
      },
    ])
  ),
  expectedGains: {} as any,
  targetAudience: 'Test',
});

describe('planCompression', () => {
  describe('compressPlan', () => {
    it('returns uncompressed template when enough weeks available', () => {
      const template = make10WeekTemplate();
      const result = compressPlan(template, {
        targetDate: new Date('2026-06-07'), // 10 weeks from start
        startDate: new Date('2026-03-29'),
        fitnessLevel: 'intermediate',
      });

      expect(result.wasCompressed).toBe(false);
      expect(result.compressedDuration).toBe(10);
      expect(result.removedWeeks).toEqual([]);
    });

    it('compresses plan when target date is closer than duration', () => {
      const template = make10WeekTemplate();
      const result = compressPlan(template, {
        targetDate: new Date('2026-05-24'), // ~8 weeks from start
        startDate: new Date('2026-03-29'),
        fitnessLevel: 'intermediate',
      });

      expect(result.wasCompressed).toBe(true);
      expect(result.compressedDuration).toBeLessThan(10);
      expect(result.removedWeeks.length).toBeGreaterThan(0);
    });

    it('never removes taper or peak phases', () => {
      const template = make10WeekTemplate();
      const result = compressPlan(template, {
        targetDate: new Date('2026-05-10'), // ~6 weeks from start
        startDate: new Date('2026-03-29'),
        fitnessLevel: 'advanced',
      });

      // All remaining phases should include peak and taper
      const remainingPhaseNames = result.template.phases.map(p => p.phase);
      expect(remainingPhaseNames).toContain('peak');
      expect(remainingPhaseNames).toContain('taper');
    });

    it('removes more base weeks for advanced fitness', () => {
      const template = make10WeekTemplate();

      const advancedResult = compressPlan(template, {
        targetDate: new Date('2026-05-24'),
        startDate: new Date('2026-03-29'),
        fitnessLevel: 'advanced',
      });

      const beginnerResult = compressPlan(template, {
        targetDate: new Date('2026-05-24'),
        startDate: new Date('2026-03-29'),
        fitnessLevel: 'beginner',
      });

      // Advanced should be able to remove more weeks
      expect(advancedResult.removedWeeks.length).toBeGreaterThanOrEqual(
        beginnerResult.removedWeeks.length
      );
    });

    it('uses CTL to override fitness level', () => {
      const template = make10WeekTemplate();
      const result = compressPlan(template, {
        targetDate: new Date('2026-05-24'),
        startDate: new Date('2026-03-29'),
        fitnessLevel: 'beginner', // Says beginner but CTL says advanced
        ctl: 70,
      });

      expect(result.warnings.some(w => w.includes('adjusted'))).toBe(true);
    });

    it('refuses to compress below minimum weeks', () => {
      const template = make10WeekTemplate();
      const result = compressPlan(template, {
        targetDate: new Date('2026-04-12'), // Only 2 weeks
        startDate: new Date('2026-03-29'),
        fitnessLevel: 'advanced',
      });

      expect(result.wasCompressed).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('renumbers weeks sequentially after compression', () => {
      const template = make10WeekTemplate();
      const result = compressPlan(template, {
        targetDate: new Date('2026-05-24'),
        startDate: new Date('2026-03-29'),
        fitnessLevel: 'advanced',
      });

      if (result.wasCompressed) {
        const weekNumbers = Object.keys(result.template.weekTemplates).map(Number).sort((a, b) => a - b);
        // Should be 1, 2, 3, ... with no gaps
        for (let i = 0; i < weekNumbers.length; i++) {
          expect(weekNumbers[i]).toBe(i + 1);
        }
        expect(weekNumbers.length).toBe(result.compressedDuration);
      }
    });
  });

  describe('previewCompression', () => {
    it('returns preview without modifying template', () => {
      const template = make10WeekTemplate();
      const preview = previewCompression(template, {
        targetDate: new Date('2026-05-24'),
        startDate: new Date('2026-03-29'),
        fitnessLevel: 'intermediate',
      });

      expect(preview.availableWeeks).toBe(8);
      expect(preview.weeksToRemove).toBe(2);
      // Template should be unchanged
      expect(template.duration).toBe(10);
    });

    it('reports when compression is not possible', () => {
      const template = make10WeekTemplate();
      const preview = previewCompression(template, {
        targetDate: new Date('2026-04-05'), // ~1 week
        startDate: new Date('2026-03-29'),
        fitnessLevel: 'beginner',
      });

      expect(preview.canCompress).toBe(false);
      expect(preview.warnings.length).toBeGreaterThan(0);
    });
  });
});
