import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { measureRouteSurface, createSurfaceRoute, layerProps } = vi.hoisted(() => ({
  measureRouteSurface: vi.fn(),
  createSurfaceRoute: vi.fn().mockReturnValue({ type: 'FeatureCollection', features: [] }),
  layerProps: [] as Array<Record<string, unknown>>,
}));
vi.mock('../../../../utils/surfaceOverlay.js', () => ({
  createSurfaceRoute: (...a: unknown[]) => createSurfaceRoute(...a),
}));
vi.mock('../../../../utils/roadAttributes', () => ({
  measureRouteSurface: (...a: unknown[]) => measureRouteSurface(...a),
}));
vi.mock('react-map-gl', () => ({
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Layer: (props: Record<string, unknown>) => {
    layerProps.push(props);
    return null;
  },
}));

import { SurfaceLayer } from '../SurfaceLayer';

const geometry = {
  type: 'LineString' as const,
  coordinates: [
    [-105, 40],
    [-105.01, 40.01],
    [-105.02, 40.02],
  ] as [number, number][],
};

const result = {
  segments: ['paved', 'gravel'] as Array<'paved' | 'gravel' | 'unpaved' | 'unknown'>,
  inferences: [
    { category: 'paved' as const, confidence: 0.95, evidence: 'surface' as const, detail: 'surface=asphalt' },
    { category: 'gravel' as const, confidence: 0.8, evidence: 'tracktype' as const, detail: 'tracktype=grade2' },
  ],
  summary: {} as never,
  source: 'brouter_trace' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  layerProps.length = 0;
  measureRouteSurface.mockResolvedValue(result);
});

describe('SurfaceLayer', () => {
  it('renders nothing when geometry is null', () => {
    const { container } = render(<SurfaceLayer geometry={null} />);
    expect(container.firstChild).toBeNull();
    expect(measureRouteSurface).not.toHaveBeenCalled();
  });

  it('uncontrolled: measures for itself, reports segments and builds the features', async () => {
    const onSegments = vi.fn();
    render(<SurfaceLayer geometry={geometry} onSegments={onSegments} />);
    await waitFor(() => expect(measureRouteSurface).toHaveBeenCalledWith(geometry.coordinates));
    await waitFor(() => expect(onSegments).toHaveBeenCalledWith(result.segments));
    expect(createSurfaceRoute).toHaveBeenCalledWith(geometry.coordinates, result.segments, result.inferences);
  });

  it('controlled: renders the given result without measuring, with a dashed layer for inferred runs', () => {
    render(<SurfaceLayer geometry={geometry} result={result} />);
    expect(measureRouteSurface).not.toHaveBeenCalled();
    expect(createSurfaceRoute).toHaveBeenCalledWith(geometry.coordinates, result.segments, result.inferences);
    const ids = layerProps.map((p) => p.id);
    expect(ids).toEqual(['rb2-surface-line', 'rb2-surface-line-inferred']);
    const dashed = layerProps[1].paint as Record<string, unknown>;
    expect(dashed['line-dasharray']).toEqual([2, 1.5]);
  });

  it('controlled with null: gray line only, one layer', () => {
    render(<SurfaceLayer geometry={geometry} result={null} />);
    expect(measureRouteSurface).not.toHaveBeenCalled();
    expect(createSurfaceRoute).not.toHaveBeenCalled();
    expect(layerProps.map((p) => p.id)).toEqual(['rb2-surface-line']);
  });
});
