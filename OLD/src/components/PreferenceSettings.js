import React, { useState, useEffect } from 'react';
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
  Grid,
} from '@mantine/core';
import {
  Settings,
  Route,
  Shield,
  Mountain,
  Camera,
  Heart,
  AlertCircle,
  Gauge,
  Star,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { EnhancedContextCollector } from '../utils/enhancedContext';
import { getUserSpeedProfile, analyzeUserSpeedProfile } from '../utils/speedAnalysis';
import toast from 'react-hot-toast';

const PreferenceSettings = ({ opened, onClose }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
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

  // Speed profile state
  const [speedProfile, setSpeedProfile] = useState(null);
  const [recalculating, setRecalculating] = useState(false);

  // Load existing preferences
  useEffect(() => {
    if (!user || !opened) return;
    
    const loadPreferences = async () => {
      setLoading(true);
      try {
        const prefs = await EnhancedContextCollector.getCompletePreferences(user.id);
        if (prefs) {
          // Routing preferences
          setTrafficTolerance(prefs.traffic_tolerance || 'low');
          setHillPreference(prefs.hill_preference || 'moderate');
          setMaxGradient(prefs.max_gradient_comfort || 10);
          setTurningPreference(prefs.turning_preference || 'minimal_turns');
          
          // Surface preferences
          setSurfaceQuality(prefs.surface_quality || 'good');
          setGravelTolerance((prefs.gravel_tolerance || 0.1) * 100);
          setWetWeatherPavedOnly(prefs.wet_weather_paved_only !== false);
          
          // Safety preferences
          setBikeInfrastructure(prefs.bike_infrastructure || 'strongly_preferred');
          setRestStopFrequency(prefs.rest_stop_frequency || 15);
          setCellCoverage(prefs.cell_coverage || 'important');
          
          // Scenic preferences
          setScenicImportance(prefs.scenic_importance || 'important');
          setPreferredViews(prefs.preferred_views || ['nature', 'water']);
          setPhotographyStops(prefs.photography_stops !== false);
          setQuietnessLevel(prefs.quietness_level || 'high');
          
          // Training context
          setTrainingPhase(prefs.current_phase || 'base_building');
          setWeeklyVolume(prefs.weekly_volume_km || 100);
          setFatigueLevel(prefs.fatigue_level || 'fresh');
        }

        // Load speed profile
        const profile = await getUserSpeedProfile(user.id);
        setSpeedProfile(profile);

      } catch (error) {
        console.error('Error loading preferences:', error);
        toast.error('Failed to load preferences');
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, [user, opened]);

  // Recalculate speed profile from ride history
  const handleRecalculateSpeed = async () => {
    setRecalculating(true);
    try {
      const newProfile = await analyzeUserSpeedProfile(user.id);
      if (newProfile.hasData) {
        setSpeedProfile(await getUserSpeedProfile(user.id));
        toast.success('Speed profile updated from your ride history!');
      } else {
        toast.error(`Need more ride data (${newProfile.ridesCount} rides found, need at least 3)`);
      }
    } catch (error) {
      console.error('Error recalculating speed profile:', error);
      toast.error('Failed to recalculate speed profile');
    } finally {
      setRecalculating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save routing preferences
      await EnhancedContextCollector.updatePreferences(user.id, 'routing', {
        traffic_tolerance: trafficTolerance,
        hill_preference: hillPreference,
        max_gradient_comfort: maxGradient,
        turning_preference: turningPreference,
      });
      
      // Save surface preferences
      await EnhancedContextCollector.updatePreferences(user.id, 'surface', {
        surface_quality: surfaceQuality,
        gravel_tolerance: gravelTolerance / 100,
        wet_weather_paved_only: wetWeatherPavedOnly,
      });
      
      // Save safety preferences
      await EnhancedContextCollector.updatePreferences(user.id, 'safety', {
        bike_infrastructure: bikeInfrastructure,
        rest_stop_frequency: restStopFrequency,
        cell_coverage: cellCoverage,
      });
      
      // Save scenic preferences
      await EnhancedContextCollector.updatePreferences(user.id, 'scenic', {
        scenic_importance: scenicImportance,
        preferred_views: preferredViews,
        photography_stops: photographyStops,
        quietness_level: quietnessLevel,
      });
      
      // Save training context
      await EnhancedContextCollector.updatePreferences(user.id, 'training', {
        current_phase: trainingPhase,
        weekly_volume_km: weeklyVolume,
        fatigue_level: fatigueLevel,
      });
      
      toast.success('Preferences saved successfully!');
      onClose();
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Failed to save preferences');
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
          <Settings size={24} />
          <Title order={3}>Route Preferences</Title>
        </Group>
      }
      size="lg"
      overlayProps={{ opacity: 0.55, blur: 3 }}
    >
      <LoadingOverlay visible={loading} />
      
      <Stack>
        <Alert icon={<AlertCircle size={16} />} color="blue">
          <Text size="sm" mb="xs">
            <strong>Smart Traffic Avoidance:</strong> Customize your route preferences to get more personalized routes that match your riding style and goals.
          </Text>
          <Text size="xs">
            The Smart Route Planner now intelligently avoids heavy traffic based on your preferences, using advanced routing algorithms
            to find quiet roads, bike infrastructure, and peaceful routes when you prefer them.
          </Text>
        </Alert>
        
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="routing" leftSection={<Route size={16} />}>
              Routing
            </Tabs.Tab>
            <Tabs.Tab value="surface" leftSection={<Mountain size={16} />}>
              Surface
            </Tabs.Tab>
            <Tabs.Tab value="safety" leftSection={<Shield size={16} />}>
              Safety
            </Tabs.Tab>
            <Tabs.Tab value="scenic" leftSection={<Camera size={16} />}>
              Scenic
            </Tabs.Tab>
            <Tabs.Tab value="training" leftSection={<Heart size={16} />}>
              Training
            </Tabs.Tab>
            <Tabs.Tab value="speed" leftSection={<Gauge size={16} />}>
              Speed
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="routing" pt="md">
            <Stack>
              <Select
                label="Traffic Tolerance"
                description="How comfortable are you riding near traffic? This heavily influences route selection."
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
                Routes may be slightly longer but significantly quieter.
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
                description="Preference for protected bike lanes, paths, and cycling infrastructure"
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
                This provides the safest separation from vehicle traffic.
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
              <Text size="xs" c="dimmed" mt="-10">
                🤫 <strong>High quietness</strong> works with traffic tolerance settings to find the most peaceful routes possible. 
                This may use walking paths or residential streets when appropriate.
              </Text>
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

          <Tabs.Panel value="speed" pt="md">
            <Stack>
              {speedProfile && speedProfile.hasSufficientData ? (
                <>
                  <Alert color="blue" icon={<Gauge size={16} />}>
                    <Text size="sm" fw={600} mb="xs">Your Cycling Speed Profile</Text>
                    <Text size="xs">
                      Based on {speedProfile.ridesAnalyzedCount} imported rides.
                      These speeds personalize route duration estimates.
                    </Text>
                  </Alert>

                  <Paper withBorder p="md">
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Text size="sm" fw={600}>Speed Confidence</Text>
                        <Group gap="xs">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              size={14}
                              fill={i < Math.round(speedProfile.speedConfidence * 5) ? '#ffc107' : 'none'}
                              color={i < Math.round(speedProfile.speedConfidence * 5) ? '#ffc107' : '#ccc'}
                            />
                          ))}
                          <Badge size="xs" color={speedProfile.speedConfidence > 0.7 ? 'green' : 'yellow'}>
                            {(speedProfile.speedConfidence * 100).toFixed(0)}%
                          </Badge>
                        </Group>
                      </Group>

                      <Grid gutter="md" mt="xs">
                        <Grid.Col span={6}>
                          <Paper withBorder p="sm">
                            <Text size="xs" c="dimmed">Road (flat)</Text>
                            <Text size="lg" fw={600}>{speedProfile.baseRoadSpeed} km/h</Text>
                          </Paper>
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <Paper withBorder p="sm">
                            <Text size="xs" c="dimmed">Gravel</Text>
                            <Text size="lg" fw={600}>{speedProfile.baseGravelSpeed || 'N/A'}</Text>
                          </Paper>
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <Paper withBorder p="sm">
                            <Text size="xs" c="dimmed">Climbing</Text>
                            <Text size="lg" fw={600}>{speedProfile.baseClimbingSpeed || 'N/A'}</Text>
                          </Paper>
                        </Grid.Col>
                        <Grid.Col span={6}>
                          <Paper withBorder p="sm">
                            <Text size="xs" c="dimmed">Commuting</Text>
                            <Text size="lg" fw={600}>{speedProfile.baseCommuteSpeed || 'N/A'}</Text>
                          </Paper>
                        </Grid.Col>
                      </Grid>

                      <Text size="xs" c="dimmed" mt="xs">
                        💡 Current pace: {Math.round(speedProfile.currentSpeedModifier * 100)}%
                        {speedProfile.fatigueLevel !== 'fresh' && (
                          <> • You're {speedProfile.fatigueLevel}</>
                        )}
                      </Text>
                    </Stack>
                  </Paper>

                  <Button
                    leftSection={<RefreshCw size={16} />}
                    variant="light"
                    onClick={handleRecalculateSpeed}
                    loading={recalculating}
                  >
                    Recalculate from Rides
                  </Button>
                </>
              ) : (
                <Alert color="yellow" icon={<AlertCircle size={16} />}>
                  <Text size="sm" fw={600} mb="xs">Insufficient Ride Data</Text>
                  <Text size="xs" mb="sm">
                    {speedProfile?.ridesAnalyzedCount > 0
                      ? `Found ${speedProfile.ridesAnalyzedCount} rides. Need at least 10 rides with speed data to calculate your profile.`
                      : 'No rides with speed data found. Import rides from Strava, Wahoo, or Garmin to personalize route speeds.'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    💡 Using default speeds: Road 25 km/h • Gravel 20 km/h • Climbing 14 km/h
                  </Text>
                  {speedProfile?.ridesAnalyzedCount > 0 && (
                    <Button
                      leftSection={<RefreshCw size={16} />}
                      variant="light"
                      size="xs"
                      onClick={handleRecalculateSpeed}
                      loading={recalculating}
                      mt="sm"
                    >
                      Try Recalculating
                    </Button>
                  )}
                </Alert>
              )}
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