/**
 * IntelStrip - Coach Intel banner for Training Hub Edit Mode
 * Full-width dark bar with one-line AI-generated weekly briefing
 */

import { useState, useEffect, useRef } from 'react';
import { Box, Group, Text, Loader } from '@mantine/core';
import { Lightbulb } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabase';

interface IntelStripProps {
  visible: boolean;
  weekNumber: number | null;
  scheduledWorkouts: Array<{
    name?: string;
    workout_type?: string;
    target_tss?: number;
  }>;
  trainingMetrics: {
    tsb?: number;
    atl?: number;
    ctl?: number;
  } | null;
  daysToRace?: number | null;
  coachPersona?: string;
}

// Cache briefings by week number to avoid re-fetching
const briefingCache: Record<number, { briefing: string; personaName: string }> = {};

export function IntelStrip({
  visible,
  weekNumber,
  scheduledWorkouts,
  trainingMetrics,
  daysToRace = null,
  coachPersona = 'pragmatist',
}: IntelStripProps) {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [personaName, setPersonaName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const fetchedWeekRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible || weekNumber === null || weekNumber === undefined) return;

    // Check cache
    if (briefingCache[weekNumber]) {
      setBriefing(briefingCache[weekNumber].briefing);
      setPersonaName(briefingCache[weekNumber].personaName);
      return;
    }

    // Don't re-fetch for same week
    if (fetchedWeekRef.current === weekNumber) return;
    fetchedWeekRef.current = weekNumber;

    const fetchBriefing = async () => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const response = await fetch('/api/coach-intel', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            weekNumber,
            scheduledWorkouts: scheduledWorkouts.map((w) => ({
              name: w.name,
              workout_type: w.workout_type,
              target_tss: w.target_tss,
            })),
            currentTSB: trainingMetrics?.tsb,
            currentATL: trainingMetrics?.atl,
            currentCTL: trainingMetrics?.ctl,
            daysToRace,
            coachPersona,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setBriefing(data.briefing);
          setPersonaName(data.personaName || '');
          briefingCache[weekNumber] = {
            briefing: data.briefing,
            personaName: data.personaName || '',
          };
        }
      } catch (err) {
        console.error('Intel Strip fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBriefing();
  }, [visible, weekNumber, scheduledWorkouts, trainingMetrics, daysToRace, coachPersona]);

  if (!visible) return null;

  return (
    <Box
      style={{
        backgroundColor: '#141410',
        borderBottom: '3px solid #2A8C82',
        padding: '10px 16px',
      }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap={10} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Lightbulb size={16} color="#2A8C82" weight="fill" style={{ flexShrink: 0 }} />
          <Text
            size="xs"
            fw={700}
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: '#2A8C82',
              flexShrink: 0,
            }}
          >
            COACH INTEL — WEEK {weekNumber || '?'}
          </Text>
          {loading ? (
            <Loader size="xs" color="teal" />
          ) : (
            <Text
              size="sm"
              style={{
                color: '#E8E8E4',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {briefing || 'Analyzing your week...'}
            </Text>
          )}
        </Group>
        {personaName && (
          <Text
            size="xs"
            fw={700}
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              letterSpacing: '1px',
              textTransform: 'uppercase',
              color: '#C49A0A',
              flexShrink: 0,
            }}
          >
            {personaName.replace('The ', '')}
          </Text>
        )}
      </Group>
    </Box>
  );
}

export default IntelStrip;
