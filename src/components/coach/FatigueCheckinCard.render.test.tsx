import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import FatigueCheckinCard from './FatigueCheckinCard';

const getSession = vi.fn();
const fetchMock = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: () => getSession() } },
}));

function draw() {
  return render(
    <MantineProvider>
      <FatigueCheckinCard />
    </MantineProvider>
  );
}

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('FatigueCheckinCard', () => {
  it('offers the form when today has no check-in', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ checkin: null, readiness: null }) });
    draw();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText(/Morning Readiness/i)).toBeInTheDocument();
  });

  it('asks every field the readiness rules read', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ checkin: null }) });
    draw();
    for (const label of [/Sleep/i, /Leg Feel/i, /Energy/i, /Motivation/i, /Feeling ill today/i]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('shows a summary instead of a blank form when today is already answered', async () => {
    // The card renders on both the Coach tab and Today. Without this, the
    // second page would offer a fresh form defaulting every slider to 3, and
    // submitting it would upsert over a real check-in.
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        checkin: { date: '2026-09-01', sleep: 2, leg_feel: 1, motivation: 4, illness: false },
      }),
    });
    draw();
    await waitFor(() => expect(screen.getByText(/Morning check-in recorded/i)).toBeInTheDocument());
    expect(screen.queryByText(/Feeling ill today/i)).not.toBeInTheDocument();
  });

  it('reports back what was actually answered, not the defaults', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        checkin: { date: '2026-09-01', sleep: 2, leg_feel: 1, motivation: 4, illness: false },
      }),
    });
    draw();
    await waitFor(() => expect(screen.getByText(/Sleep: Poor/)).toBeInTheDocument());
    expect(screen.getByText(/Legs: Very heavy/)).toBeInTheDocument();
    expect(screen.getByText(/Motivation: Good/)).toBeInTheDocument();
  });

  it('surfaces a reported illness in the summary', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        checkin: { date: '2026-09-01', sleep: 3, leg_feel: 3, motivation: 3, illness: true },
      }),
    });
    draw();
    await waitFor(() => expect(screen.getByText(/Reported ill/i)).toBeInTheDocument());
  });

  it('falls back to the blank form when the lookup fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    draw();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText(/Morning Readiness/i)).toBeInTheDocument();
  });

  it('falls back to the blank form when signed out', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    draw();
    expect(screen.getByText(/Morning Readiness/i)).toBeInTheDocument();
  });
});
