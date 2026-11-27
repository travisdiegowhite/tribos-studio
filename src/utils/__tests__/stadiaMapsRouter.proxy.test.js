import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStadiaMapsRoute, isStadiaMapsAvailable } from '../stadiaMapsRouter';

const fetchMock = vi.fn();
const WAYPOINTS = [
  [-105.27, 40.01],
  [-105.25, 40.03],
];

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Stadia behind the routing proxy', () => {
  it('posts to /api/stadia-route without any key when the proxy is on', async () => {
    vi.stubEnv('VITE_ROUTING_PROXY', 'true');
    vi.stubEnv('VITE_STADIA_API_KEY', '');
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' });
    await expect(getStadiaMapsRoute(WAYPOINTS, { profile: 'road' })).rejects.toThrow();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/stadia-route$/);
    expect(url).not.toMatch(/api_key/);
    expect(JSON.parse(init.body).costing).toBe('bicycle');
  });

  it('counts as available with no browser key when the proxy is on', () => {
    vi.stubEnv('VITE_STADIA_API_KEY', '');
    vi.stubEnv('VITE_ROUTING_PROXY', 'true');
    expect(isStadiaMapsAvailable()).toBe(true);
    vi.stubEnv('VITE_ROUTING_PROXY', 'false');
    expect(isStadiaMapsAvailable()).toBe(false);
  });

  it('turns a proxy 429 into routing_rate_limited and tells the page', async () => {
    vi.stubEnv('VITE_ROUTING_PROXY', 'true');
    const heard = vi.fn();
    window.addEventListener('tribos:routing-rate-limited', heard);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: 'routing_rate_limited', guest: true }),
    });
    await expect(getStadiaMapsRoute(WAYPOINTS, { profile: 'road' })).rejects.toThrow('routing_rate_limited');
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener('tribos:routing-rate-limited', heard);
  });

  it('still calls Stadia directly with the key when the proxy is off', async () => {
    vi.stubEnv('VITE_ROUTING_PROXY', 'false');
    vi.stubEnv('VITE_STADIA_API_KEY', 'test-key');
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' });
    await expect(getStadiaMapsRoute(WAYPOINTS, { profile: 'road' })).rejects.toThrow();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.stadiamaps.com/route/v1?api_key=test-key');
  });
});
