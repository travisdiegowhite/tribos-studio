/**
 * DeepRideAnalysis — collapsible deep AI ride analysis panel.
 *
 * Mounted under the short coach narrative on the Check-In page when the
 * check-in's activity has FIT time-series data persisted in
 * activities.fit_coach_context. The narrative is generated lazily on
 * first expand by /api/coach-ride-analysis and cached on the activity row.
 *
 * If the activity has no FIT data (e.g. Strava-only sync), this component
 * hides itself entirely after the first request.
 */

import { useState } from 'react';
import { Paper, Stack, Group, Text, Button, Loader, Box } from '@mantine/core';
import { ChartLine, Sparkle } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabase';
import { CoachMarkdown } from './CoachMarkdown';

interface DeepRideAnalysisProps {
  activityId: string;
}

interface AnalysisResponse {
  success: true;
  cached: boolean;
  persona_id: string;
  analysis: string;
  generated_at: string;
}

type Status = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export default function DeepRideAnalysis({ activityId }: DeepRideAnalysisProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const fetchAnalysis = async () => {
    setStatus('loading');
    setErrorMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/coach-ride-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ activityId }),
      });

      if (response.status === 400) {
        const body = await response.json().catch(() => ({}));
        if (body.error === 'no_fit_data') {
          // Hide the section entirely — this activity has no FIT data
          setStatus('unavailable');
          return;
        }
        throw new Error(body.message || 'Bad request');
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `Request failed (${response.status})`);
      }

      const data = (await response.json()) as AnalysisResponse;
      setAnalysis(data.analysis);
      setCached(data.cached);
      setStatus('ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load deep analysis.';
      setErrorMessage(msg);
      setStatus('error');
    }
  };

  // Hide the entire panel if we already learned this activity has no FIT data
  if (status === 'unavailable') {
    return null;
  }

  return (
    <Paper
      p="lg"
      withBorder
      style={{
        borderRadius: 0,
        borderColor: 'var(--tribos-border-default)',
        borderLeft: '3px solid var(--color-teal)',
        borderLeftColor: 'var(--color-teal)',
      }}
    >
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <ChartLine size={16} color="var(--color-teal)" />
            <Text size="xs" fw={700} tt="uppercase" ff="monospace" c="dimmed">
              Deep Ride Analysis
            </Text>
          </Group>
          {status === 'idle' && (
            <Button
              variant="outline"
              size="xs"
              color="teal"
              leftSection={<Sparkle size={14} />}
              onClick={fetchAnalysis}
              style={{ borderRadius: 0 }}
            >
              Show deep analysis
            </Button>
          )}
          {status === 'ready' && cached && (
            <Text size="xs" c="dimmed" ff="monospace">cached</Text>
          )}
        </Group>

        {status === 'idle' && (
          <Text size="sm" c="dimmed">
            Generate a long-form coach analysis of power, heart rate, and cadence
            for this ride — execution fidelity, decoupling, dropouts, the works.
          </Text>
        )}

        {status === 'loading' && (
          <Group gap="xs">
            <Loader size="xs" color="var(--color-teal)" />
            <Text size="sm" c="dimmed">Analyzing the time series…</Text>
          </Group>
        )}

        {status === 'error' && (
          <Stack gap="xs">
            <Text size="sm" c="red">{errorMessage}</Text>
            <Box>
              <Button
                variant="subtle"
                size="xs"
                color="teal"
                onClick={fetchAnalysis}
                style={{ borderRadius: 0 }}
              >
                Try again
              </Button>
            </Box>
          </Stack>
        )}

        {status === 'ready' && analysis && (
          <Box style={{ maxWidth: 720 }}>
            <CoachMarkdown size="md">{analysis}</CoachMarkdown>
          </Box>
        )}
      </Stack>
    </Paper>
  );
}
