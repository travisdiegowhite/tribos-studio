import { describe, it, expect } from 'vitest';
import {
  formatDistanceKm,
  formatMetricValue,
  metricUnit,
  summarizeMetric,
} from './rideMetricStats';

describe('summarizeMetric', () => {
  it('averages power including zeros (coasting counts) and skips nulls', () => {
    const s = summarizeMetric('power', [200, 0, null, 300, undefined]);
    expect(s).toEqual({ avg: 500 / 3, max: 300, min: 0, count: 3 });
  });

  it('treats zero heart rate and elevation as dropouts', () => {
    expect(summarizeMetric('heartRate', [0, 140, 150])).toEqual({ avg: 145, max: 150, min: 140, count: 2 });
    expect(summarizeMetric('elevation', [0, 1600, 1620])?.count).toBe(2);
  });

  it('is null with nothing usable', () => {
    expect(summarizeMetric('power', null)).toBeNull();
    expect(summarizeMetric('power', [])).toBeNull();
    expect(summarizeMetric('heartRate', [0, null, NaN])).toBeNull();
  });
});

describe('formatting', () => {
  it('converts speed to km/h and rounds', () => {
    expect(formatMetricValue('speed', 10)).toBe('36');
    expect(formatMetricValue('power', 212.4)).toBe('212');
    expect(formatMetricValue('power', null)).toBe('–');
  });

  it('names units', () => {
    expect(metricUnit('speed')).toBe('km/h');
    expect(metricUnit('power')).toBe('W');
    expect(metricUnit('heartRate')).toBe('bpm');
    expect(metricUnit('elevation')).toBe('m');
  });

  it('formats distance to one decimal', () => {
    expect(formatDistanceKm(12.34)).toBe('12.3 km');
    expect(formatDistanceKm(null)).toBe('–');
  });
});
