import { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Stack,
  Group,
  Text,
  Title,
  Select,
  Slider,
  Switch,
  MultiSelect,
  Paper,
  Tabs,
  Badge,
  Alert,
  LoadingOverlay,
} from '@mantine/core';
import {
  IconSettings,
  IconRoute,
  IconShield,
  IconMountain,
  IconCamera,
  IconHeart,
  IconAlertCircle,
} from '@tabler/icons-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { notifications } from '@mantine/notifications';

/**
 * PreferenceSettings - Route preference configuration modal
 * Allows users to customize their routing preferences
 * Note: Settings are stored locally until database tables are created
 */
const PreferenceSettings = ({ opened, onClose }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('routing');

  // Routing preferences
  const [trafficTolerance, setTrafficTolerance] = useState('low');
  const [hillPreference, setHillPreference] = useState('moderate');
  const [maxGradient, setMaxGradient] = useState(10);
  const [turningPreference, setTurningPreference] = useState('minimal_turns');

  // Surface preferences
  const [surfaceQuality, setSurfaceQuality] = useState('good');
  const [gravelTolerance, setGravelTolerance] = useState(10);
  const [wetWeatherPavedOnly, setWetWeatherPavedOnly] = useState(true);

  // Safety preferences
  const [bikeInfrastructure, setBikeInfrastructure] = useState('strongly_preferred');
  const [restStopFrequency, setRestStopFrequency] = useState(15);
  const [cellCoverage, setCellCoverage] = useState('important');

  // Scenic preferences
  const [scenicImportance, setScenicImportance] = useState('important');
  const [preferredViews, setPreferredViews] = useState(['nature', 'water']);
  const [photographyStops, setPhotographyStops] = useState(true);
  const [quietnessLevel, setQuietnessLevel] = useState('high');

  // Training context
  const [trainingPhase, setTrainingPhase] = useState('base_building');
  const [weeklyVolume, setWeeklyVolume] = useState(100);
  const [fatigueLevel, setFatigueLevel] = useState('fresh');

  // Load existing preferences from localStorage
  useEffect(() => {
    if (!opened) return;

    setLoading(true);
    try {
      const savedPrefs = localStorage.getItem('routePreferences');
      if (savedPrefs) {
        const prefs = JSON.parse(savedPrefs);

        // Routing preferences
        setTrafficTolerance(prefs.trafficTolerance || 'low');
        setHillPreference(prefs.hillPreference || 'moderate');
        setMaxGradient(prefs.maxGradient || 10);
        setTurningPreference(prefs.turningPreference || 'minimal_turns');

        // Surface preferences
        setSurfaceQuality(prefs.surfaceQuality || 'good');
        setGravelTolerance(prefs.gravelTolerance || 10);
        setWetWeatherPavedOnly(prefs.wetWeatherPavedOnly !== false);

        // Safety preferences
        setBikeInfrastructure(prefs.bikeInfrastructure || 'strongly_preferred');
        setRestStopFrequency(prefs.restStopFrequency || 15);
        setCellCoverage(prefs.cellCoverage || 'important');

        // Scenic preferences
        setScenicImportance(prefs.scenicImportance || 'important');
        setPreferredViews(prefs.preferredViews || ['nature', 'water']);
        setPhotographyStops(prefs.photographyStops !== false);
        setQuietnessLevel(prefs.quietnessLevel || 'high');

        // Training context
        setTrainingPhase(prefs.trainingPhase || 'base_building');
        setWeeklyVolume(prefs.weeklyVolume || 100);
        setFatigueLevel(prefs.fatigueLevel || 'fresh');
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  }, [opened]);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save to localStorage for now (database tables may not exist)
      const preferences = {
        trafficTolerance,
        hillPreference,
        maxGradient,
        turningPreference,
        surfaceQuality,
        gravelTolerance,
        wetWeatherPavedOnly,
        bikeInfrastructure,
        restStopFrequency,
        cellCoverage,
        scenicImportance,
        preferredViews,
        photographyStops,
        quietnessLevel,
        trainingPhase,
        weeklyVolume,
        fatigueLevel,
      };

      localStorage.setItem('routePreferences', JSON.stringify(preferences));

      notifications.show({
        title: 'Preferences Saved',
        message: 'Your route preferences have been saved',
        color: 'green',
      });
      onClose();
    } catch (error) {
      console.error('Error saving preferences:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to save preferences',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group>
          <IconSettings size={24} />
          <Title order={3}>Route Preferences</Title>
        </Group>
      }
      size="lg"
      overlayProps={{ opacity: 0.55, blur: 3 }}
    >
      <LoadingOverlay visible={loading} />

      <Stack>
        <Alert icon={<IconAlertCircle size={16} />} color="blue">
          <Text size="sm" mb="xs">
            <strong>Smart Route Preferences:</strong> Customize your route preferences to get more personalized routes that match your riding style and goals.
          </Text>
          <Text size="xs">
            These settings influence how routes are generated, prioritizing quiet roads, bike infrastructure, and peaceful routes based on your preferences.
          </Text>
        </Alert>

        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="routing" leftSection={<IconRoute size={16} />}>
              Routing
            </Tabs.Tab>
            <Tabs.Tab value="surface" leftSection={<IconMountain size={16} />}>
              Surface
            </Tabs.Tab>
            <Tabs.Tab value="safety" leftSection={<IconShield size={16} />}>
              Safety
            </Tabs.Tab>
            <Tabs.Tab value="scenic" leftSection={<IconCamera size={16} />}>
              Scenic
            </Tabs.Tab>
            <Tabs.Tab value="training" leftSection={<IconHeart size={16} />}>
              Training
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="routing" pt="md">
            <Stack>
              <Select
                label="Traffic Tolerance"
                description="How comfortable are you riding near traffic?"
                value={trafficTolerance}
                onChange={setTrafficTolerance}
                data={[
                  { value: 'low', label: 'Low - Avoid busy roads, prefer quiet streets' },
                  { value: 'medium', label: 'Medium - Some traffic okay, avoid highways' },
                  { value: 'high', label: 'High - Comfortable with any road type' },
                ]}
              />
              <Text size="xs" c="dimmed" mt="-10">
                💡 <strong>Low traffic tolerance</strong> will prioritize residential streets, bike paths, and less traveled roads.
              </Text>

              <Select
                label="Hill Preference"
                description="Do you seek out climbs or prefer flat routes?"
                value={hillPreference}
                onChange={setHillPreference}
                data={[
                  { value: 'avoid', label: 'Avoid - Keep it flat' },
                  { value: 'moderate', label: 'Moderate - Some hills okay' },
                  { value: 'seek', label: 'Seek - Love climbing!' },
                ]}
              />

              <div>
                <Text size="sm" fw={500} mb={5}>
                  Maximum Comfortable Gradient: {maxGradient}%
                </Text>
                <Slider
                  value={maxGradient}
                  onChange={setMaxGradient}
                  min={5}
                  max={20}
                  marks={[
                    { value: 5, label: '5%' },
                    { value: 10, label: '10%' },
                    { value: 15, label: '15%' },
                    { value: 20, label: '20%' },
                  ]}
                />
              </div>

              <Select
                label="Turn Complexity"
                description="Simple routes or technical navigation?"
                value={turningPreference}
                onChange={setTurningPreference}
                data={[
                  { value: 'minimal_turns', label: 'Minimal - Straightforward routes' },
                  { value: 'varied', label: 'Varied - Mix of turns' },
                  { value: 'technical', label: 'Technical - Complex navigation' },
                ]}
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="surface" pt="md">
            <Stack>
              <Select
                label="Surface Quality"
                description="Minimum acceptable road surface quality"
                value={surfaceQuality}
                onChange={setSurfaceQuality}
                data={[
                  { value: 'excellent', label: 'Excellent - Smooth pavement only' },
                  { value: 'good', label: 'Good - Minor imperfections okay' },
                  { value: 'fair', label: 'Fair - Rough roads acceptable' },
                  { value: 'poor_ok', label: 'Any - Adventure ready' },
                ]}
              />

              <div>
                <Text size="sm" fw={500} mb={5}>
                  Gravel Tolerance: {gravelTolerance}% of route
                </Text>
                <Slider
                  value={gravelTolerance}
                  onChange={setGravelTolerance}
                  min={0}
                  max={50}
                  marks={[
                    { value: 0, label: '0%' },
                    { value: 25, label: '25%' },
                    { value: 50, label: '50%' },
                  ]}
                />
              </div>

              <Switch
                label="Paved roads only in wet weather"
                description="Avoid unpaved surfaces when it's raining"
                checked={wetWeatherPavedOnly}
                onChange={(e) => setWetWeatherPavedOnly(e.currentTarget.checked)}
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="safety" pt="md">
            <Stack>
              <Select
                label="Bike Infrastructure"
                description="Preference for protected bike lanes and cycling infrastructure"
                value={bikeInfrastructure}
                onChange={setBikeInfrastructure}
                data={[
                  { value: 'required', label: 'Required - Must have separated bike infrastructure' },
                  { value: 'strongly_preferred', label: 'Strongly Preferred - Prioritize bike lanes' },
                  { value: 'preferred', label: 'Preferred - Nice to have bike infrastructure' },
                  { value: 'flexible', label: 'Flexible - Any road is fine' },
                ]}
              />
              <Text size="xs" c="dimmed" mt="-10">
                🚴 <strong>Required infrastructure</strong> will find routes using bike paths, protected lanes, and cycling-friendly streets.
              </Text>

              <div>
                <Text size="sm" fw={500} mb={5}>
                  Rest Stop Frequency: Every {restStopFrequency} km
                </Text>
                <Slider
                  value={restStopFrequency}
                  onChange={setRestStopFrequency}
                  min={5}
                  max={30}
                  step={5}
                  marks={[
                    { value: 5, label: '5km' },
                    { value: 15, label: '15km' },
                    { value: 30, label: '30km' },
                  ]}
                />
              </div>

              <Select
                label="Cell Coverage"
                description="How important is phone signal?"
                value={cellCoverage}
                onChange={setCellCoverage}
                data={[
                  { value: 'critical', label: 'Critical - Always needed' },
                  { value: 'important', label: 'Important - Mostly needed' },
                  { value: 'nice_to_have', label: 'Nice to have' },
                  { value: 'not_important', label: 'Not important' },
                ]}
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="scenic" pt="md">
            <Stack>
              <Select
                label="Scenic Importance"
                description="How much do views matter?"
                value={scenicImportance}
                onChange={setScenicImportance}
                data={[
                  { value: 'critical', label: 'Critical - Must be beautiful' },
                  { value: 'important', label: 'Important - Prefer scenic' },
                  { value: 'nice_to_have', label: 'Nice to have' },
                  { value: 'not_important', label: 'Not important - Just ride' },
                ]}
              />

              <MultiSelect
                label="Preferred Views"
                description="What scenery do you enjoy?"
                value={preferredViews}
                onChange={setPreferredViews}
                data={[
                  { value: 'nature', label: 'Nature' },
                  { value: 'water', label: 'Water views' },
                  { value: 'mountains', label: 'Mountains' },
                  { value: 'rolling_hills', label: 'Rolling hills' },
                  { value: 'farmland', label: 'Farmland' },
                  { value: 'urban', label: 'Urban' },
                  { value: 'historic', label: 'Historic sites' },
                ]}
              />

              <Switch
                label="Photography stops"
                description="Include photo-worthy locations"
                checked={photographyStops}
                onChange={(e) => setPhotographyStops(e.currentTarget.checked)}
              />

              <Select
                label="Quietness Level"
                description="How important is it to avoid noise and find peaceful routes?"
                value={quietnessLevel}
                onChange={setQuietnessLevel}
                data={[
                  { value: 'high', label: 'High - Prioritize peaceful, quiet roads' },
                  { value: 'medium', label: 'Medium - Balance quiet with efficiency' },
                  { value: 'low', label: 'Low - Noise not a concern' },
                ]}
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="training" pt="md">
            <Stack>
              <Select
                label="Training Phase"
                description="Current training cycle phase"
                value={trainingPhase}
                onChange={setTrainingPhase}
                data={[
                  { value: 'base_building', label: 'Base Building' },
                  { value: 'build', label: 'Build Phase' },
                  { value: 'peak', label: 'Peak/Race Phase' },
                  { value: 'recovery', label: 'Recovery' },
                  { value: 'maintenance', label: 'Maintenance' },
                ]}
              />

              <div>
                <Text size="sm" fw={500} mb={5}>
                  Weekly Volume: {weeklyVolume} km
                </Text>
                <Slider
                  value={weeklyVolume}
                  onChange={setWeeklyVolume}
                  min={25}
                  max={500}
                  step={25}
                  marks={[
                    { value: 50, label: '50' },
                    { value: 200, label: '200' },
                    { value: 350, label: '350' },
                    { value: 500, label: '500' },
                  ]}
                />
              </div>

              <Select
                label="Current Fatigue Level"
                description="How fresh are your legs?"
                value={fatigueLevel}
                onChange={setFatigueLevel}
                data={[
                  { value: 'fresh', label: 'Fresh - Ready for anything' },
                  { value: 'moderate', label: 'Moderate - Normal tiredness' },
                  { value: 'tired', label: 'Tired - Need easier rides' },
                  { value: 'exhausted', label: 'Exhausted - Recovery only' },
                ]}
              />
            </Stack>
          </Tabs.Panel>
        </Tabs>

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save Preferences
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default PreferenceSettings;
