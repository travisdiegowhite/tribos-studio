import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Text,
  Group,
  Stack,
  Button,
  Box,
  ThemeIcon,
} from '@mantine/core';
import { IconBrain, IconMessageCircle } from '@tabler/icons-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../lib/supabase';

export default function ProactiveInsightCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [insight, setInsight] = useState(null);
  const [activityName, setActivityName] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInsight = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('proactive_insights')
        .select('id, insight_text, activity_id, created_at')
        .eq('user_id', user.id)
        .eq('seen', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setInsight(null);
        setLoading(false);
        return;
      }

      setInsight(data);

      // Fetch the activity name for context
      if (data.activity_id) {
        const { data: activity } = await supabase
          .from('activities')
          .select('name, start_date')
          .eq('id', data.activity_id)
          .single();

        if (activity) {
          const date = new Date(activity.start_date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          setActivityName(`${activity.name} — ${date}`);
        }
      }
    } catch {
      setInsight(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchInsight();
  }, [fetchInsight]);

  const handleTalkToCoach = async () => {
    if (!insight) return;

    // Mark as seen
    await supabase
      .from('proactive_insights')
      .update({ seen: true, seen_at: new Date().toISOString() })
      .eq('id', insight.id);

    // Navigate to coach
    navigate('/coach');
  };

  const handleDismiss = async () => {
    if (!insight) return;

    await supabase
      .from('proactive_insights')
      .update({ seen: true, seen_at: new Date().toISOString() })
      .eq('id', insight.id);

    setInsight(null);
  };

  if (loading || !insight) return null;

  return (
    <Card
      id="insight-card"
      style={{
        borderLeft: '3px solid var(--tribos-sage-500, #6B8C72)',
      }}
    >
      <Group gap="sm" mb="xs" wrap="nowrap">
        <ThemeIcon size="md" variant="light" color="sage" radius="xl">
          <IconBrain size={16} />
        </ThemeIcon>
        <Box style={{ flex: 1 }}>
          <Text
            size="xs"
            fw={600}
            tt="uppercase"
            ff="'DM Mono', monospace"
            lts={1}
            style={{ color: 'var(--tribos-sage-500, #6B8C72)' }}
          >
            Your coach noticed something
          </Text>
          {activityName && (
            <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
              About your ride: {activityName}
            </Text>
          )}
        </Box>
      </Group>

      <Text
        size="sm"
        mb="md"
        style={{
          color: 'var(--tribos-text-primary)',
          lineHeight: 1.5,
        }}
      >
        {insight.insight_text}
      </Text>

      <Group gap="sm">
        <Button
          variant="light"
          color="sage"
          size="compact-sm"
          leftSection={<IconMessageCircle size={14} />}
          onClick={handleTalkToCoach}
        >
          Talk to your coach
        </Button>
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          onClick={handleDismiss}
        >
          Dismiss
        </Button>
      </Group>
    </Card>
  );
}
