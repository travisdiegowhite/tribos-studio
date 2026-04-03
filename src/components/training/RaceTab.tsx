/**
 * RaceTab — Race planning tab for the Training Dashboard.
 *
 * Combines race goals, route preview, and AI coach chat
 * so athletes can plan race strategy in one place.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Stack,
  Text,
  Paper,
  Box,
  Group,
  Button,
  Badge,
  Loader,
  TextInput,
  ActionIcon,
  ScrollArea,
  ThemeIcon,
  Divider,
  Grid,
  UnstyledButton,
} from '@mantine/core';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { supabase } from '../../lib/supabase';
import { getRoute } from '../../utils/routesService';
import RaceGoalModal from '../RaceGoalModal';
import { CoachMarkdown } from '../coach/CoachMarkdown';
import {
  CalendarBlank,
  CaretRight,
  ChatCircle,
  MapPin,
  Mountains,
  PaperPlaneRight,
  Path,
  Plus,
  Target,
  Trophy,
} from '@phosphor-icons/react';
import { tokens } from '../../theme';
import RoutePreviewMap from '../RouteBuilder/RoutePreviewMap';

// ─── Types ───────────────────────────────────────────────────────────────

interface RaceGoal {
  id: string;
  name: string;
  race_date: string;
  race_type: string;
  distance_km: number | null;
  elevation_gain_m: number | null;
  location: string | null;
  priority: string;
  goal_time_minutes: number | null;
  goal_power_watts: number | null;
  goal_placement: string | null;
  notes: string | null;
  course_description: string | null;
  route_id: string | null;
  status: string;
}

interface RouteData {
  id: string;
  name: string;
  distance_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  estimated_duration_minutes: number;
  route_type: string;
  surface_type: string;
  difficulty_rating: number;
  geometry: any;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'coach';
  message: string;
  timestamp: string;
}

interface RaceTabProps {
  trainingContext?: string | null;
  isImperial?: boolean;
  formatDist?: (km: number) => string;
  formatElev?: (m: number) => string;
}

// ─── Race Type Labels ────────────────────────────────────────────────────

const RACE_TYPE_INFO: Record<string, { icon: string; label: string }> = {
  road_race: { icon: '🚴', label: 'Road Race' },
  criterium: { icon: '🔄', label: 'Criterium' },
  time_trial: { icon: '⏱️', label: 'Time Trial' },
  gran_fondo: { icon: '🏔️', label: 'Gran Fondo' },
  century: { icon: '💯', label: 'Century' },
  gravel: { icon: '🪨', label: 'Gravel' },
  cyclocross: { icon: '🌲', label: 'Cyclocross' },
  mtb: { icon: '🏔️', label: 'MTB' },
  triathlon: { icon: '🏊', label: 'Triathlon' },
  other: { icon: '🎯', label: 'Event' },
};

// ─── Suggested Questions ─────────────────────────────────────────────────

const RACE_QUESTIONS = [
  'What pacing strategy should I use?',
  'Create a fueling plan for this race',
  'How should I taper for this event?',
  'What are the key segments to watch?',
  'Analyze my readiness for this race',
];

// ─── Component ───────────────────────────────────────────────────────────

export default function RaceTab({
  trainingContext = null,
  isImperial = false,
  formatDist,
  formatElev,
}: RaceTabProps) {
  const { user } = useAuth() as { user: { id: string } | null };

  // Race goals state
  const [raceGoals, setRaceGoals] = useState<RaceGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRaceId, setSelectedRaceId] = useState<string | null>(null);
  const [completedRaces, setCompletedRaces] = useState<RaceGoal[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRace, setEditingRace] = useState<RaceGoal | null>(null);

  // Route state
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [computedElevation, setComputedElevation] = useState<number | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedRace = raceGoals.find((r) => r.id === selectedRaceId) || null;

  // ─── Load Race Goals ───────────────────────────────────────────────────

  const loadRaceGoals = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('race_goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'upcoming')
        .gte('race_date', new Date().toISOString().split('T')[0])
        .order('race_date', { ascending: true })
        .limit(10);

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) return;
        throw error;
      }
      setRaceGoals(data || []);

      // Auto-select first race if none selected
      if (data && data.length > 0 && !selectedRaceId) {
        setSelectedRaceId(data[0].id);
      }

      // Also load completed races (last 6 months) for context
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const { data: pastRaces } = await supabase
        .from('race_goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .gte('race_date', sixMonthsAgo.toISOString().split('T')[0])
        .order('race_date', { ascending: false })
        .limit(5);

      setCompletedRaces(pastRaces || []);
    } catch (err) {
      console.error('Failed to load race goals:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, selectedRaceId]);

  useEffect(() => {
    loadRaceGoals();
  }, [loadRaceGoals]);

  // ─── Load Route When Race Changes ──────────────────────────────────────

  useEffect(() => {
    if (!selectedRace?.route_id) {
      setRouteData(null);
      return;
    }

    setRouteLoading(true);
    setComputedElevation(null);
    getRoute(selectedRace.route_id)
      .then((data) => setRouteData(data))
      .catch((err) => {
        console.error('Failed to load route:', err);
        setRouteData(null);
      })
      .finally(() => setRouteLoading(false));
  }, [selectedRace?.route_id]);

  // ─── Load Chat History For Selected Race ───────────────────────────────

  useEffect(() => {
    if (!user?.id || !selectedRaceId) {
      setMessages([]);
      return;
    }

    const loadChatHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('coach_conversations')
          .select('id, role, message, timestamp')
          .eq('user_id', user.id)
          .eq('race_goal_id', selectedRaceId)
          .order('timestamp', { ascending: true })
          .limit(50);

        if (error) {
          // race_goal_id column may not exist yet if migration hasn't run
          console.log('Race chat history query failed (migration may be pending):', error.message);
          setMessages([]);
          return;
        }

        setMessages(data || []);
      } catch {
        setMessages([]);
      }
    };

    loadChatHistory();
  }, [user?.id, selectedRaceId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ─── Build Race-Specific Context ───────────────────────────────────────

  const buildRaceContext = () => {
    const parts: string[] = [];
    if (trainingContext) parts.push(trainingContext);

    if (selectedRace) {
      const daysUntil = Math.ceil(
        (new Date(selectedRace.race_date + 'T00:00:00').getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      );

      parts.push(`\n--- ACTIVE RACE DISCUSSION ---`);
      parts.push(`Race: ${selectedRace.name}`);
      parts.push(`Date: ${selectedRace.race_date} (${daysUntil} days away)`);
      parts.push(`Type: ${selectedRace.race_type?.replace('_', ' ')}`);
      parts.push(`Priority: ${selectedRace.priority}-race`);
      if (selectedRace.distance_km) parts.push(`Distance: ${Math.round(selectedRace.distance_km)} km`);
      if (selectedRace.elevation_gain_m) parts.push(`Elevation: ${Math.round(selectedRace.elevation_gain_m)}m gain`);
      if (selectedRace.goal_time_minutes) {
        const h = Math.floor(selectedRace.goal_time_minutes / 60);
        const m = selectedRace.goal_time_minutes % 60;
        parts.push(`Target: ${h}h ${m}m`);
      }
      if (selectedRace.goal_power_watts) parts.push(`Target Power: ${selectedRace.goal_power_watts}W`);
      if (selectedRace.goal_placement) parts.push(`Goal: ${selectedRace.goal_placement}`);
      if (selectedRace.course_description) parts.push(`Course: ${selectedRace.course_description}`);
      if (selectedRace.location) parts.push(`Location: ${selectedRace.location}`);
    }

    if (routeData) {
      parts.push(`\n--- LINKED ROUTE DATA ---`);
      parts.push(`Route: "${routeData.name}"`);
      parts.push(`Distance: ${routeData.distance_km?.toFixed(1)} km`);
      parts.push(`Elevation Gain: ${routeData.elevation_gain_m}m`);
      if (routeData.elevation_loss_m) parts.push(`Elevation Loss: ${routeData.elevation_loss_m}m`);
      if (routeData.surface_type) parts.push(`Surface: ${routeData.surface_type}`);
      if (routeData.route_type) parts.push(`Route Type: ${routeData.route_type}`);
      if (routeData.difficulty_rating) parts.push(`Difficulty: ${routeData.difficulty_rating}/5`);
      if (routeData.estimated_duration_minutes) {
        const h = Math.floor(routeData.estimated_duration_minutes / 60);
        const m = routeData.estimated_duration_minutes % 60;
        parts.push(`Estimated Duration: ${h}h ${m}m`);
      }
      parts.push(`The athlete has linked a specific route to this race. Use the route data to provide specific pacing, terrain, and strategy advice.`);
    }

    // Include completed race results for historical reference
    if (completedRaces.length > 0) {
      parts.push(`\n--- RECENT RACE RESULTS ---`);
      parts.push(`Reference these past results to assess readiness and compare fitness progression.`);
      completedRaces.forEach((race) => {
        const raceDate = new Date(race.race_date + 'T00:00:00');
        let line = `${race.name} (${raceDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`;
        line += ` — ${race.race_type?.replace('_', ' ')}`;
        if (race.distance_km) line += `, ${Math.round(race.distance_km)} km`;
        const resultParts: string[] = [];
        if ((race as any).actual_time_minutes) {
          const h = Math.floor((race as any).actual_time_minutes / 60);
          const m = (race as any).actual_time_minutes % 60;
          resultParts.push(`${h}h ${m}m`);
        }
        if ((race as any).actual_power_watts) resultParts.push(`${(race as any).actual_power_watts}W`);
        if ((race as any).actual_placement) resultParts.push((race as any).actual_placement);
        if (resultParts.length > 0) line += ` | Result: ${resultParts.join(', ')}`;
        if ((race as any).result_notes) line += ` | ${(race as any).result_notes}`;
        parts.push(line);
      });
    }

    return parts.join('\n');
  };

  // ─── Send Chat Message ─────────────────────────────────────────────────

  const handleSendMessage = async (text?: string) => {
    const msg = (text || chatInput).trim();
    if (!msg || chatLoading || !user?.id || !selectedRaceId) return;

    setChatInput('');
    setChatLoading(true);

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      message: msg,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const history = messages.map((m) => ({
        role: m.role === 'coach' ? 'assistant' : 'user',
        content: m.message,
      }));

      const { data: { session } } = await supabase.auth.getSession();

      const now = new Date();
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          message: msg,
          conversationHistory: history,
          trainingContext: buildRaceContext(),
          userId: user.id,
          maxTokens: 2048,
          quickMode: true,
          userLocalDate: {
            dayOfWeek: now.getDay(),
            date: now.getDate(),
            month: now.getMonth(),
            year: now.getFullYear(),
            dateString: now.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to get response');
      }

      const data = await res.json();
      const coachResponse = data.message || '';

      // Persist messages — try with race_goal_id, fall back without if column doesn't exist
      const timestamp = new Date().toISOString();
      const userMsg = {
        user_id: user.id,
        role: 'user',
        message: msg,
        message_type: 'chat',
        race_goal_id: selectedRaceId,
        coach_type: 'training',
        timestamp,
      };
      const coachMsg = {
        user_id: user.id,
        role: 'coach',
        message: coachResponse,
        message_type: 'chat',
        race_goal_id: selectedRaceId,
        coach_type: 'training',
        timestamp: new Date(Date.now() + 1).toISOString(),
      };

      const results = await Promise.all([
        supabase.from('coach_conversations').insert(userMsg),
        supabase.from('coach_conversations').insert(coachMsg),
      ]);

      // If inserts failed (race_goal_id column missing), retry without it
      if (results[0].error || results[1].error) {
        const { race_goal_id: _u, ...userMsgFallback } = userMsg;
        const { race_goal_id: _c, ...coachMsgFallback } = coachMsg;
        await Promise.all([
          supabase.from('coach_conversations').insert(userMsgFallback),
          supabase.from('coach_conversations').insert(coachMsgFallback),
        ]);
      }

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        { ...tempUserMsg, id: `user-${Date.now()}` },
        {
          id: `coach-${Date.now()}`,
          role: 'coach',
          message: coachResponse,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error('Race chat error:', err);
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
      setChatInput(msg);
    } finally {
      setChatLoading(false);
      inputRef.current?.focus();
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────

  const getDaysUntil = (dateStr: string) => {
    const raceDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((raceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getCountdownColor = (days: number) => {
    if (days <= 7) return 'red';
    if (days <= 14) return 'yellow';
    return 'gray';
  };

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  // ─── Loading State ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="sm" color="teal" />
        <Text size="sm" c="dimmed">Loading race goals...</Text>
      </Stack>
    );
  }

  // ─── Empty State ───────────────────────────────────────────────────────

  if (raceGoals.length === 0) {
    return (
      <Paper
        p="xl"
        withBorder
        style={{ borderRadius: 0, textAlign: 'center' }}
      >
        <Trophy size={48} style={{ color: 'var(--color-text-muted)', marginBottom: 12 }} />
        <Text size="lg" fw={600} mb="xs">
          No Upcoming Races
        </Text>
        <Text size="sm" c="dimmed" mb="lg" maw={400} mx="auto">
          Add a race goal to start planning your strategy, pacing, and fueling with the AI coach.
        </Text>
        <Button
          color="orange"
          leftSection={<Trophy size={16} />}
          onClick={() => {
            setEditingRace(null);
            setModalOpen(true);
          }}
        >
          Add Your First Race Goal
        </Button>

        <RaceGoalModal
          opened={modalOpen}
          onClose={() => setModalOpen(false)}
          raceGoal={editingRace}
          onSaved={() => {
            loadRaceGoals();
            setModalOpen(false);
          }}
          isImperial={isImperial}
        />
      </Paper>
    );
  }

  // ─── Main Layout ───────────────────────────────────────────────────────

  return (
    <Stack gap="md">
      {/* Race Goals List */}
      <Paper
        p="md"
        withBorder
        style={{ borderRadius: 0, borderColor: 'var(--tribos-border-default)' }}
      >
        <Group justify="space-between" mb="sm">
          <Group gap="sm">
            <ThemeIcon size="md" color="orange" variant="light">
              <Trophy size={16} />
            </ThemeIcon>
            <Text size="sm" fw={700} tt="uppercase" ff="monospace">
              Race Goals
            </Text>
          </Group>
          <Button
            size="xs"
            variant="light"
            color="orange"
            leftSection={<Plus size={14} />}
            onClick={() => {
              setEditingRace(null);
              setModalOpen(true);
            }}
          >
            Add Race
          </Button>
        </Group>

        <Stack gap="xs">
          {raceGoals.map((race) => {
            const daysUntil = getDaysUntil(race.race_date);
            const isSelected = race.id === selectedRaceId;
            const typeInfo = RACE_TYPE_INFO[race.race_type] || RACE_TYPE_INFO.other;

            return (
              <UnstyledButton
                key={race.id}
                onClick={() => setSelectedRaceId(race.id)}
                style={{ width: '100%' }}
              >
                <Paper
                  p="sm"
                  withBorder
                  style={{
                    borderRadius: 0,
                    borderColor: isSelected ? 'var(--mantine-color-teal-6)' : 'var(--tribos-border-default)',
                    borderWidth: isSelected ? 2 : 1,
                    backgroundColor: isSelected ? 'rgba(61, 139, 80, 0.05)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs" mb={2}>
                        <Text size="md">{typeInfo.icon}</Text>
                        <Badge
                          size="xs"
                          color={race.priority === 'A' ? 'red' : race.priority === 'B' ? 'orange' : 'gray'}
                          variant="filled"
                        >
                          {race.priority}
                        </Badge>
                        <Text fw={600} size="sm" lineClamp={1}>
                          {race.name}
                        </Text>
                        {race.route_id && (
                          <Badge size="xs" color="teal" variant="light" leftSection={<MapPin size={10} />}>
                            Route
                          </Badge>
                        )}
                      </Group>
                      <Group gap="md">
                        <Group gap={4}>
                          <CalendarBlank size={12} style={{ color: 'var(--color-text-muted)' }} />
                          <Text size="xs" c="dimmed">
                            {new Date(race.race_date + 'T00:00:00').toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </Text>
                        </Group>
                        {race.distance_km && (
                          <Group gap={4}>
                            <Path size={12} style={{ color: 'var(--color-text-muted)' }} />
                            <Text size="xs" c="dimmed">
                              {isImperial
                                ? `${Math.round(race.distance_km * 0.621371)} mi`
                                : `${Math.round(race.distance_km)} km`}
                            </Text>
                          </Group>
                        )}
                      </Group>
                    </Box>
                    <Box ta="center" style={{ minWidth: 50 }}>
                      <Text size="lg" fw={700} c={getCountdownColor(daysUntil)}>
                        {daysUntil}
                      </Text>
                      <Text size="xs" c="dimmed">days</Text>
                    </Box>
                  </Group>
                </Paper>
              </UnstyledButton>
            );
          })}
        </Stack>
      </Paper>

      {/* Selected Race Detail + Chat */}
      {selectedRace && (
        <Grid gutter="md">
          {/* Route Preview + Race Details */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Stack gap="md">
              {/* Race Details Card */}
              <Paper
                p="md"
                withBorder
                style={{ borderRadius: 0, borderColor: 'var(--tribos-border-default)' }}
              >
                <Group justify="space-between" mb="sm">
                  <Text size="sm" fw={700} tt="uppercase" ff="monospace">
                    {selectedRace.name}
                  </Text>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => {
                      setEditingRace(selectedRace);
                      setModalOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                </Group>

                <Stack gap="xs">
                  <Group gap="md" wrap="wrap">
                    <Group gap={4}>
                      <CalendarBlank size={14} style={{ color: 'var(--color-text-muted)' }} />
                      <Text size="sm">
                        {new Date(selectedRace.race_date + 'T00:00:00').toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </Text>
                    </Group>
                    {selectedRace.location && (
                      <Group gap={4}>
                        <MapPin size={14} style={{ color: 'var(--color-text-muted)' }} />
                        <Text size="sm">{selectedRace.location}</Text>
                      </Group>
                    )}
                  </Group>

                  <Divider />

                  <Group gap="lg" wrap="wrap">
                    {selectedRace.distance_km && (
                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase" ff="monospace">Distance</Text>
                        <Text size="sm" fw={600}>
                          {isImperial
                            ? `${Math.round(selectedRace.distance_km * 0.621371)} mi`
                            : `${Math.round(selectedRace.distance_km)} km`}
                        </Text>
                      </Box>
                    )}
                    {selectedRace.elevation_gain_m && (
                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase" ff="monospace">Elevation</Text>
                        <Text size="sm" fw={600}>
                          {isImperial
                            ? `${Math.round(selectedRace.elevation_gain_m * 3.28084)} ft`
                            : `${Math.round(selectedRace.elevation_gain_m)}m`}
                        </Text>
                      </Box>
                    )}
                    {selectedRace.goal_time_minutes && (
                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase" ff="monospace">Target</Text>
                        <Text size="sm" fw={600}>{formatTime(selectedRace.goal_time_minutes)}</Text>
                      </Box>
                    )}
                    {selectedRace.goal_power_watts && (
                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase" ff="monospace">Power</Text>
                        <Text size="sm" fw={600}>{selectedRace.goal_power_watts}W</Text>
                      </Box>
                    )}
                    {selectedRace.goal_placement && (
                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase" ff="monospace">Goal</Text>
                        <Text size="sm" fw={600}>{selectedRace.goal_placement}</Text>
                      </Box>
                    )}
                  </Group>

                  {selectedRace.course_description && (
                    <>
                      <Divider />
                      <Box>
                        <Text size="xs" c="dimmed" tt="uppercase" ff="monospace" mb={4}>Course</Text>
                        <Text size="sm" style={{ lineHeight: 1.5 }}>
                          {selectedRace.course_description}
                        </Text>
                      </Box>
                    </>
                  )}
                </Stack>
              </Paper>

              {/* Linked Route Card */}
              {routeLoading ? (
                <Paper
                  p="md"
                  withBorder
                  style={{ borderRadius: 0, borderColor: 'var(--tribos-border-default)' }}
                >
                  <Group gap="xs">
                    <Loader size="xs" color="teal" />
                    <Text size="sm" c="dimmed">Loading route...</Text>
                  </Group>
                </Paper>
              ) : routeData ? (
                <Paper
                  p="md"
                  withBorder
                  style={{ borderRadius: 0, borderColor: 'var(--mantine-color-teal-4)' }}
                >
                  <Group gap="xs" mb="sm">
                    <MapPin size={14} style={{ color: 'var(--mantine-color-teal-6)' }} />
                    <Text size="sm" fw={700} tt="uppercase" ff="monospace">
                      Linked Route
                    </Text>
                  </Group>
                  <Text size="sm" fw={600} mb="xs">{routeData.name}</Text>
                  <Group gap="lg" wrap="wrap">
                    <Box>
                      <Text size="xs" c="dimmed">Distance</Text>
                      <Text size="sm" fw={500}>
                        {isImperial
                          ? `${Math.round(routeData.distance_km * 0.621371)} mi`
                          : `${routeData.distance_km?.toFixed(1)} km`}
                      </Text>
                    </Box>
                    <Box>
                      <Text size="xs" c="dimmed">Elevation</Text>
                      <Text size="sm" fw={500}>
                        {(() => {
                          const elevM = computedElevation ?? routeData.elevation_gain_m;
                          if (!elevM) return '—';
                          return isImperial
                            ? `${Math.round(elevM * 3.28084)} ft`
                            : `${Math.round(elevM)}m`;
                        })()}
                      </Text>
                    </Box>
                    {routeData.surface_type && (
                      <Box>
                        <Text size="xs" c="dimmed">Surface</Text>
                        <Text size="sm" fw={500} tt="capitalize">{routeData.surface_type}</Text>
                      </Box>
                    )}
                    {routeData.route_type && (
                      <Box>
                        <Text size="xs" c="dimmed">Type</Text>
                        <Text size="sm" fw={500} tt="capitalize">{routeData.route_type?.replace('_', ' ')}</Text>
                      </Box>
                    )}
                  </Group>
                  {routeData.geometry && (
                    <Box mt="sm">
                      <RoutePreviewMap
                        geometry={routeData.geometry}
                        mode="terrain"
                        height={160}
                        onElevationLoaded={(stats) => {
                          if (stats.gain) setComputedElevation(stats.gain);
                        }}
                      />
                    </Box>
                  )}
                  <Group justify="flex-end" mt="xs">
                    <Button
                      size="xs"
                      variant="subtle"
                      color="teal"
                      component="a"
                      href={`/routes/${routeData.id}`}
                      rightSection={<CaretRight size={12} />}
                    >
                      Open in Route Builder
                    </Button>
                  </Group>
                </Paper>
              ) : selectedRace.route_id ? null : (
                <Paper
                  p="md"
                  withBorder
                  style={{
                    borderRadius: 0,
                    borderStyle: 'dashed',
                    borderColor: 'var(--tribos-border-default)',
                    textAlign: 'center',
                  }}
                >
                  <MapPin size={24} style={{ color: 'var(--color-text-muted)', marginBottom: 8 }} />
                  <Text size="sm" c="dimmed" mb="xs">
                    No route linked
                  </Text>
                  <Text size="xs" c="dimmed" mb="sm">
                    Edit this race goal to link a saved route for detailed strategy advice.
                  </Text>
                  <Button
                    size="xs"
                    variant="light"
                    color="teal"
                    leftSection={<MapPin size={14} />}
                    onClick={() => {
                      setEditingRace(selectedRace);
                      setModalOpen(true);
                    }}
                  >
                    Link a Route
                  </Button>
                </Paper>
              )}
            </Stack>
          </Grid.Col>

          {/* Race Planning Chat */}
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Paper
              p="md"
              withBorder
              style={{
                borderRadius: 0,
                borderColor: 'var(--tribos-border-default)',
                display: 'flex',
                flexDirection: 'column',
                minHeight: 400,
              }}
            >
              {/* Header */}
              <Group gap={6} mb="sm">
                <ChatCircle size={14} color="var(--mantine-color-teal-6)" />
                <Text size="sm" fw={700} tt="uppercase" ff="monospace">
                  Race Strategy Chat
                </Text>
                <Text size="xs" c="dimmed" ml="auto">
                  {selectedRace.name}
                </Text>
              </Group>

              <Divider mb="sm" />

              {/* Messages */}
              {messages.length > 0 ? (
                <ScrollArea.Autosize mah={350} ref={scrollRef} mb="sm" style={{ flex: 1 }}>
                  <Stack gap="xs">
                    {messages.map((msg) => (
                      <Box
                        key={msg.id}
                        style={{
                          alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                          maxWidth: '85%',
                        }}
                      >
                        <Paper
                          p="xs"
                          px="sm"
                          style={{
                            borderRadius: 0,
                            backgroundColor:
                              msg.role === 'user'
                                ? 'var(--mantine-color-teal-0)'
                                : 'var(--color-bg-secondary, var(--mantine-color-gray-0))',
                            border: `1px solid ${
                              msg.role === 'user'
                                ? 'var(--mantine-color-teal-2)'
                                : 'var(--tribos-border-default, var(--mantine-color-gray-3))'
                            }`,
                          }}
                        >
                          {msg.role === 'user' ? (
                            <Text size="sm" style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                              {msg.message}
                            </Text>
                          ) : (
                            <CoachMarkdown size="sm">{msg.message}</CoachMarkdown>
                          )}
                        </Paper>
                      </Box>
                    ))}
                    {chatLoading && (
                      <Group gap={4} px="sm">
                        <Loader size={12} color="teal" />
                        <Text size="xs" c="dimmed">Coach is analyzing your race...</Text>
                      </Group>
                    )}
                  </Stack>
                </ScrollArea.Autosize>
              ) : (
                <Box mb="sm" style={{ flex: 1 }}>
                  <Text size="sm" c="dimmed" mb="md">
                    Ask the coach about pacing, fueling, tapering, or race-day strategy for {selectedRace.name}.
                  </Text>
                  <Stack gap="xs">
                    {RACE_QUESTIONS.map((q) => (
                      <UnstyledButton
                        key={q}
                        onClick={() => handleSendMessage(q)}
                        style={{ width: '100%' }}
                      >
                        <Paper
                          p="xs"
                          px="sm"
                          withBorder
                          style={{
                            borderRadius: 0,
                            borderColor: 'var(--tribos-border-default)',
                            cursor: 'pointer',
                          }}
                        >
                          <Group gap="xs">
                            <CaretRight size={12} style={{ color: 'var(--mantine-color-teal-6)' }} />
                            <Text size="sm">{q}</Text>
                          </Group>
                        </Paper>
                      </UnstyledButton>
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Input */}
              <TextInput
                ref={inputRef}
                placeholder={`Ask about ${selectedRace.name}...`}
                value={chatInput}
                onChange={(e) => setChatInput(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={chatLoading}
                rightSection={
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="teal"
                    onClick={() => handleSendMessage()}
                    disabled={!chatInput.trim() || chatLoading}
                  >
                    <PaperPlaneRight size={14} />
                  </ActionIcon>
                }
                styles={{
                  input: {
                    borderRadius: 0,
                    borderColor: 'var(--tribos-border-default)',
                    fontSize: 'var(--mantine-font-size-sm)',
                  },
                }}
              />
            </Paper>
          </Grid.Col>
        </Grid>
      )}

      {/* Race Goal Modal */}
      <RaceGoalModal
        opened={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingRace(null);
        }}
        raceGoal={editingRace}
        onSaved={() => {
          loadRaceGoals();
          setModalOpen(false);
          setEditingRace(null);
        }}
        isImperial={isImperial}
      />
    </Stack>
  );
}
