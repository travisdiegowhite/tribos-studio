import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUserLocation } from '../useUserLocation';

vi.mock('../../../features/route-builder-v2/telemetry/trackRb2', () => ({
  trackRb2: vi.fn(),
}));

import { trackRb2 } from '../../../features/route-builder-v2/telemetry/trackRb2';

const mockTrack = vi.mocked(trackRb2);

type Geo = NonNullable<typeof navigator.geolocation>;

let getCurrentPositionMock: ReturnType<typeof vi.fn>;
let originalGeolocation: Geo | undefined;

beforeEach(() => {
  mockTrack.mockReset();
  getCurrentPositionMock = vi.fn();
  originalGeolocation = navigator.geolocation;
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: getCurrentPositionMock,
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    },
  });
});

afterEach(() => {
  if (originalGeolocation === undefined) {
    delete (navigator as unknown as { geolocation?: Geo }).geolocation;
  } else {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeolocation,
    });
  }
});

function makePosition(longitude: number, latitude: number, accuracy = 20): GeolocationPosition {
  return {
    coords: {
      longitude,
      latitude,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.now(),
    toJSON: () => ({}),
  } as GeolocationPosition;
}

function makePositionError(code: 1 | 2 | 3, message = 'denied'): GeolocationPositionError {
  return {
    code,
    message,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

describe('useUserLocation — capability gates', () => {
  it('returns unsupported when navigator.geolocation is absent', () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useUserLocation({ autoRequest: true }));
    expect(result.current.status).toBe('unsupported');
    expect(result.current.coord).toBeNull();
    expect(mockTrack).toHaveBeenCalledWith('geolocation_unsupported', {});
  });
});

describe('useUserLocation — autoRequest', () => {
  it('auto-requests on mount when autoRequest is true', () => {
    const { result } = renderHook(() => useUserLocation({ autoRequest: true }));
    expect(getCurrentPositionMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('locating');
    expect(mockTrack).toHaveBeenCalledWith('geolocation_requested', {});
  });

  it('does not auto-request when autoRequest is false', () => {
    renderHook(() => useUserLocation({ autoRequest: false }));
    expect(getCurrentPositionMock).not.toHaveBeenCalled();
  });

  it('does not double-request on re-render', () => {
    const { rerender } = renderHook(() => useUserLocation({ autoRequest: true }));
    rerender();
    rerender();
    expect(getCurrentPositionMock).toHaveBeenCalledTimes(1);
  });
});

describe('useUserLocation — outcomes', () => {
  it('resolves to ok + canonical [lng, lat] on success', async () => {
    let successCb: PositionCallback | null = null;
    getCurrentPositionMock.mockImplementation((s) => {
      successCb = s;
    });
    const { result } = renderHook(() => useUserLocation({ autoRequest: true }));
    expect(result.current.status).toBe('locating');

    await act(async () => {
      successCb?.(makePosition(-105.27, 40.01, 12));
    });

    expect(result.current.status).toBe('ok');
    expect(result.current.coord).toEqual([-105.27, 40.01]);
    expect(result.current.error).toBeNull();
    expect(mockTrack).toHaveBeenCalledWith(
      'geolocation_resolved',
      expect.objectContaining({ accuracy: 12 }),
    );
  });

  it('reports denied when PERMISSION_DENIED is returned', async () => {
    let errorCb: PositionErrorCallback | null = null;
    getCurrentPositionMock.mockImplementation((_s, e) => {
      errorCb = e;
    });
    const { result } = renderHook(() => useUserLocation({ autoRequest: true }));

    await act(async () => {
      errorCb?.(makePositionError(1, 'User denied geolocation'));
    });

    expect(result.current.status).toBe('denied');
    expect(result.current.coord).toBeNull();
    expect(result.current.error).toBe('User denied geolocation');
    expect(mockTrack).toHaveBeenCalledWith(
      'geolocation_failed',
      expect.objectContaining({ code: 1 }),
    );
  });

  it('reports error for non-permission failures', async () => {
    let errorCb: PositionErrorCallback | null = null;
    getCurrentPositionMock.mockImplementation((_s, e) => {
      errorCb = e;
    });
    const { result } = renderHook(() => useUserLocation({ autoRequest: true }));

    await act(async () => {
      errorCb?.(makePositionError(3, 'timeout'));
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('timeout');
  });
});

describe('useUserLocation — manual re-request', () => {
  it('requestLocation re-fetches even after a prior request', async () => {
    let errorCb: PositionErrorCallback | null = null;
    let successCb: PositionCallback | null = null;
    getCurrentPositionMock.mockImplementation((s, e) => {
      successCb = s;
      errorCb = e;
    });
    const { result } = renderHook(() => useUserLocation({ autoRequest: true }));

    await act(async () => {
      errorCb?.(makePositionError(1, 'denied'));
    });
    expect(result.current.status).toBe('denied');
    expect(getCurrentPositionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.requestLocation();
    });
    expect(getCurrentPositionMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      successCb?.(makePosition(-105.27, 40.01));
    });
    expect(result.current.status).toBe('ok');
  });
});
