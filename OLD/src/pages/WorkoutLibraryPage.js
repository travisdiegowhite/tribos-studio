import React, { useState, useEffect, useMemo } from 'react';
import {
  Container,
  Stack,
  Group,
  Text,
  TextInput,
  Select,
  MultiSelect,
  Card,
  Badge,
  Button,
  Grid,
  Loader,
  Center,
  Paper,
  Collapse,
  ActionIcon,
  SimpleGrid,
  RangeSlider,
  SegmentedControl,
} from '@mantine/core';
import {
  Search,
  Filter,
  Clock,
  Activity,
  Zap,
  Eye,
  UserPlus,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import workoutService from '../services/workoutService';
import coachService from '../services/coachService';
import { TRAINING_ZONES } from '../utils/trainingPlans';
import QuickAssignModal from '../components/coach/QuickAssignModal';
import WorkoutPreviewModal from '../components/coach/WorkoutPreviewModal';

const DIFFICULTY_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const ZONE_OPTIONS = Object.entries(TRAINING_ZONES).map(([key, zone]) => ({
  value: key,
  label: zone.name,
}));

const SORT_OPTIONS = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: 'duration', label: 'Duration' },
  { value: 'tss', label: 'TSS' },
  { value: 'recent', label: 'Recently Added' },
];

/**
 * WorkoutLibraryPage
 * Browse and discover workout templates
 */
const WorkoutLibraryPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workouts, setWorkouts] = useState([]);
  const [athletes, setAthletes] = useState([]);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDifficulties, setSelectedDifficulties] = useState([]);
  const [selectedZones, setSelectedZones] = useState([]);
  const [durationRange, setDurationRange] = useState([0, 180]);
  const [tssRange, setTssRange] = useState([0, 300]);
  const [sortBy, setSortBy] = useState('name');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState('my'); // 'my' or 'public'

  // Modal states
  const [previewingWorkout, setPreviewingWorkout] = useState(null);
  const [assigningWorkout, setAssigningWorkout] = useState(null);

  // Load workouts
  useEffect(() => {
    loadWorkouts();
  }, [user?.id, viewMode]);

  // Load athletes for assignment
  useEffect(() => {
    if (user?.id) {
      loadAthletes();
    }
  }, [user?.id]);

  const loadWorkouts = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      if (viewMode === 'my') {
        // Load user's custom workouts
        const { data, error } = await workoutService.getUserCustomWorkouts(user.id);
        if (error) throw error;
        setWorkouts(data || []);
      } else {
        // Load public workouts
        const { data, error } = await workoutService.getPublicWorkouts();
        if (error) throw error;
        setWorkouts(data || []);
      }
    } catch (err) {
      console.error('Error loading workouts:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAthletes = async () => {
    try {
      const { data, error } = await coachService.getAthletes(user.id, 'active');
      if (error) throw error;
      const assignableAthletes = (data || []).filter(rel => rel.can_assign_workouts);
      setAthletes(assignableAthletes);
    } catch (err) {
      console.error('Error loading athletes:', err);
    }
  };

  // Filter and sort workouts
  const filteredWorkouts = useMemo(() => {
    let filtered = [...workouts];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        w =>
          w.name.toLowerCase().includes(query) ||
          w.description?.toLowerCase().includes(query) ||
          w.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Difficulty filter
    if (selectedDifficulties.length > 0) {
      filtered = filtered.filter(w =>
        selectedDifficulties.includes(w.difficulty_level)
      );
    }

    // Zone filter
    if (selectedZones.length > 0) {
      filtered = filtered.filter(w =>
        selectedZones.includes(w.primary_zone)
      );
    }

    // Duration filter
    filtered = filtered.filter(
      w => w.duration >= durationRange[0] && w.duration <= durationRange[1]
    );

    // TSS filter
    filtered = filtered.filter(
      w => w.target_tss >= tssRange[0] && w.target_tss <= tssRange[1]
    );

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'duration':
          return b.duration - a.duration;
        case 'tss':
          return b.target_tss - a.target_tss;
        case 'recent':
          return new Date(b.created_at) - new Date(a.created_at);
        default:
          return 0;
      }
    });

    return filtered;
  }, [
    workouts,
    searchQuery,
    selectedDifficulties,
    selectedZones,
    durationRange,
    tssRange,
    sortBy,
  ]);

  const handleAssignSuccess = () => {
    // Success feedback handled by modal
  };

  // Workout card component
  const WorkoutCard = ({ workout }) => {
    const zoneInfo = workout.primary_zone ? TRAINING_ZONES[workout.primary_zone] : null;

    return (
      <Card withBorder p="md" style={{ height: '100%' }}>
        <Stack gap="sm" style={{ height: '100%' }}>
          <div style={{ flex: 1 }}>
            <Group justify="space-between" align="flex-start" mb="xs">
              <Text fw={600} size="md" c="dark" lineClamp={1}>
                {workout.name}
              </Text>
              <Badge
                size="sm"
                variant="light"
                color={
                  workout.difficulty_level === 'beginner' ? 'green' :
                  workout.difficulty_level === 'intermediate' ? 'blue' : 'orange'
                }
              >
                {workout.difficulty_level || 'intermediate'}
              </Badge>
            </Group>

            <Text size="xs" c="dimmed" lineClamp={2} mb="sm">
              {workout.description}
            </Text>

            <Group gap="xs" mb="xs" wrap="wrap">
              <Badge size="sm" variant="light" leftSection={<Clock size={12} />}>
                {workout.duration}min
              </Badge>
              <Badge size="sm" variant="light" leftSection={<Activity size={12} />}>
                {workout.target_tss} TSS
              </Badge>
              <Badge size="sm" variant="light" leftSection={<Zap size={12} />}>
                IF: {workout.intensity_factor?.toFixed(2)}
              </Badge>
              {zoneInfo && (
                <Badge size="sm" variant="light" color={zoneInfo.color}>
                  {zoneInfo.name}
                </Badge>
              )}
            </Group>

            {workout.tags && workout.tags.length > 0 && (
              <Group gap={4} mb="xs">
                {workout.tags.slice(0, 3).map(tag => (
                  <Badge key={tag} size="xs" variant="dot">
                    {tag}
                  </Badge>
                ))}
                {workout.tags.length > 3 && (
                  <Badge size="xs" variant="dot">
                    +{workout.tags.length - 3}
                  </Badge>
                )}
              </Group>
            )}

            {workout.is_public && (
              <Badge size="xs" variant="outline" color="blue" mt="xs">
                Public
              </Badge>
            )}
          </div>

          <Group gap="xs">
            <Button
              variant="light"
              size="xs"
              leftSection={<Eye size={14} />}
              onClick={() => setPreviewingWorkout(workout)}
              flex={1}
            >
              Preview
            </Button>
            {athletes.length > 0 && viewMode === 'my' && (
              <Button
                variant="filled"
                size="xs"
                leftSection={<UserPlus size={14} />}
                onClick={() => setAssigningWorkout(workout)}
                flex={1}
              >
                Assign
              </Button>
            )}
          </Group>
        </Stack>
      </Card>
    );
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <div>
          <Text size="xl" fw={700} c="dark">
            Workout Library
          </Text>
          <Text size="sm" c="dimmed">
            Browse and discover workout templates
          </Text>
        </div>

        {/* View Mode Toggle */}
        <SegmentedControl
          value={viewMode}
          onChange={setViewMode}
          data={[
            { label: 'My Workouts', value: 'my' },
            { label: 'Public Library', value: 'public' },
          ]}
        />

        {/* Search and Filters Bar */}
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Group>
              <TextInput
                placeholder="Search workouts..."
                leftSection={<Search size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1 }}
              />
              <Select
                placeholder="Sort by"
                data={SORT_OPTIONS}
                value={sortBy}
                onChange={setSortBy}
                style={{ width: 180 }}
                leftSection={<SlidersHorizontal size={16} />}
              />
              <ActionIcon
                variant={showFilters ? 'filled' : 'light'}
                size="lg"
                onClick={() => setShowFilters(!showFilters)}
              >
                {showFilters ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </ActionIcon>
            </Group>

            <Collapse in={showFilters}>
              <Stack gap="md">
                <Grid>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <MultiSelect
                      label="Difficulty"
                      placeholder="Select difficulty levels"
                      data={DIFFICULTY_OPTIONS}
                      value={selectedDifficulties}
                      onChange={setSelectedDifficulties}
                      clearable
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <MultiSelect
                      label="Primary Zone"
                      placeholder="Select training zones"
                      data={ZONE_OPTIONS}
                      value={selectedZones}
                      onChange={setSelectedZones}
                      clearable
                    />
                  </Grid.Col>
                </Grid>

                <div>
                  <Text size="sm" fw={500} mb="xs">
                    Duration: {durationRange[0]} - {durationRange[1]} min
                  </Text>
                  <RangeSlider
                    min={0}
                    max={180}
                    step={15}
                    value={durationRange}
                    onChange={setDurationRange}
                    marks={[
                      { value: 0, label: '0' },
                      { value: 60, label: '60' },
                      { value: 120, label: '120' },
                      { value: 180, label: '180' },
                    ]}
                  />
                </div>

                <div>
                  <Text size="sm" fw={500} mb="xs">
                    TSS: {tssRange[0]} - {tssRange[1]}
                  </Text>
                  <RangeSlider
                    min={0}
                    max={300}
                    step={25}
                    value={tssRange}
                    onChange={setTssRange}
                    marks={[
                      { value: 0, label: '0' },
                      { value: 100, label: '100' },
                      { value: 200, label: '200' },
                      { value: 300, label: '300' },
                    ]}
                  />
                </div>

                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => {
                    setSelectedDifficulties([]);
                    setSelectedZones([]);
                    setDurationRange([0, 180]);
                    setTssRange([0, 300]);
                    setSearchQuery('');
                  }}
                >
                  Clear All Filters
                </Button>
              </Stack>
            </Collapse>
          </Stack>
        </Paper>

        {/* Results Count */}
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            {filteredWorkouts.length} {filteredWorkouts.length === 1 ? 'workout' : 'workouts'} found
          </Text>
        </Group>

        {/* Workouts Grid */}
        {loading ? (
          <Center p="xl">
            <Stack align="center" gap="md">
              <Loader size="lg" />
              <Text size="sm" c="dimmed">
                Loading workouts...
              </Text>
            </Stack>
          </Center>
        ) : filteredWorkouts.length === 0 ? (
          <Card withBorder p="xl">
            <Stack align="center" gap="md">
              <Filter size={48} color="gray" />
              <Text size="lg" fw={600} c="dimmed">
                No workouts found
              </Text>
              <Text size="sm" c="dimmed" ta="center">
                Try adjusting your filters or search query
              </Text>
            </Stack>
          </Card>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
            {filteredWorkouts.map(workout => (
              <WorkoutCard key={workout.id} workout={workout} />
            ))}
          </SimpleGrid>
        )}
      </Stack>

      {/* Workout Preview Modal */}
      {previewingWorkout && (
        <WorkoutPreviewModal
          opened={!!previewingWorkout}
          onClose={() => setPreviewingWorkout(null)}
          workout={previewingWorkout}
          onAssign={athletes.length > 0 && viewMode === 'my' ? setAssigningWorkout : null}
        />
      )}

      {/* Quick Assign Modal */}
      {assigningWorkout && (
        <QuickAssignModal
          opened={!!assigningWorkout}
          onClose={() => setAssigningWorkout(null)}
          workout={assigningWorkout}
          athletes={athletes}
          coachId={user?.id}
          onSuccess={handleAssignSuccess}
        />
      )}
    </Container>
  );
};

export default WorkoutLibraryPage;
