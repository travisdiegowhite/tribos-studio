import { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Text,
  Button,
  Group,
  Stack,
  SegmentedControl,
  TextInput,
  Loader,
  Alert,
  Collapse,
  NumberInput,
  ThemeIcon,
  Divider,
} from '@mantine/core';
import {
  Brain,
  MapPin,
  Clock,
  ChevronDown,
  ChevronUp,
  Navigation,
  Settings,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useUnits } from '../utils/units';
import { generateAIRoutes } from '../utils/aiRouteGenerator';
import { getWeatherData, getMockWeatherData } from '../utils/weather';

/**
 * QuickRouteGenerator - Simplified 2-question route generator
 * Designed for new users who want to get a route quickly without complexity
 */
const QuickRouteGenerator = ({ mapRef, onRouteGenerated, onStartLocationSet, onShowAdvanced }) => {
  const { user } = useAuth();
  const { formatDistance } = useUnits();

  // Simplified inputs - just location and duration
  const [duration, setDuration] = useState('60'); // '30', '60', '120', 'custom'
  const [customDuration, setCustomDuration] = useState(90);
  const [startLocation, setStartLocation] = useState(null);
  const [addressInput, setAddressInput] = useState('');
  const [currentAddress, setCurrentAddress] = useState('');

  // State
  const [generating, setGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState(''); // Step-by-step progress
  const [geocoding, setGeocoding] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [error, setError] = useState(null);
  const [showCustomDuration, setShowCustomDuration] = useState(false);

  // Get actual duration in minutes
  const getDurationMinutes = () => {
    if (duration === 'custom') return customDuration;
    return parseInt(duration, 10);
  };

  // Auto-detect location on mount
  useEffect(() => {
    if (!startLocation && navigator.geolocation) {
      detectCurrentLocation();
    }
  }, []);

  const detectCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setDetectingLocation(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const location = { lat: latitude, lng: longitude };
        setStartLocation(location);

        // Reverse geocode to get address
        try {
          const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${process.env.REACT_APP_MAPBOX_TOKEN}`
          );
          const data = await response.json();
          if (data.features && data.features.length > 0) {
            const place = data.features[0];
            setCurrentAddress(place.place_name);
            setAddressInput(place.place_name);
          }
        } catch (err) {
          console.error('Reverse geocoding error:', err);
        }

        // Center map on location
        if (mapRef?.current) {
          mapRef.current.flyTo({ center: [longitude, latitude], zoom: 13 });
        }

        // Pass [lng, lat] array format to parent for map marker
        if (onStartLocationSet) {
          onStartLocationSet([longitude, latitude]);
        }

        setDetectingLocation(false);
      },
      (err) => {
        console.error('Geolocation error:', err);
        setError('Could not detect your location. Please enter an address.');
        setDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [mapRef, onStartLocationSet]);

  const geocodeAddress = useCallback(async () => {
    if (!addressInput.trim()) {
      toast.error('Please enter an address');
      return;
    }

    setGeocoding(true);
    setError(null);

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressInput)}.json?access_token=${process.env.REACT_APP_MAPBOX_TOKEN}&limit=1`
      );
      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        const location = { lat, lng };
        setStartLocation(location);
        setCurrentAddress(data.features[0].place_name);

        if (mapRef?.current) {
          mapRef.current.flyTo({ center: [lng, lat], zoom: 13 });
        }

        // Pass [lng, lat] array format to parent for map marker
        if (onStartLocationSet) {
          onStartLocationSet([lng, lat]);
        }

        toast.success('Location found!');
      } else {
        setError('Could not find that address. Try being more specific.');
      }
    } catch (err) {
      console.error('Geocoding error:', err);
      setError('Failed to search for address');
    } finally {
      setGeocoding(false);
    }
  }, [addressInput, mapRef, onStartLocationSet]);

  const handleGenerate = async () => {
    if (!startLocation) {
      toast.error('Please set a starting location');
      return;
    }

    setGenerating(true);
    setGenerationStatus('Checking weather conditions...');
    setError(null);

    try {
      // Get weather data for better route suggestions
      let weatherData = null;
      try {
        weatherData = await getWeatherData(startLocation.lat, startLocation.lng);
      } catch (weatherErr) {
        console.log('Weather fetch failed, using mock data');
        weatherData = getMockWeatherData();
      }

      setGenerationStatus('Analyzing your area...');
      await new Promise(resolve => setTimeout(resolve, 300)); // Brief pause for UX

      setGenerationStatus('Finding the best cycling roads...');

      // Generate route with sensible defaults
      // Convert startLocation object {lat, lng} to array [lng, lat] format
      const startLocationArray = [startLocation.lng, startLocation.lat];
      const routes = await generateAIRoutes({
        startLocation: startLocationArray,
        timeAvailable: getDurationMinutes(),
        trainingGoal: 'endurance', // Default to endurance for beginners
        routeType: 'loop',
        weatherData,
        trainingContext: {
          workoutType: 'endurance',
          phase: 'base',
          targetDuration: getDurationMinutes(),
          targetTSS: Math.round(getDurationMinutes() * 0.75), // Moderate effort
          primaryZone: 2,
        },
        useTrainingContext: true,
        usePastRides: false, // Keep it simple
        speedModifier: 1.0,
        userId: user?.id,
      });

      if (routes && routes.length > 0) {
        setGenerationStatus('Routes ready!');
        onRouteGenerated(routes);
        toast.success(`Generated ${routes.length} route${routes.length > 1 ? 's' : ''}!`);
      } else {
        setError('Could not generate routes for this location. Try a different area.');
      }
    } catch (err) {
      console.error('Route generation error:', err);
      setError(err.message || 'Failed to generate route');
      toast.error('Failed to generate route');
    } finally {
      setGenerating(false);
      setGenerationStatus('');
    }
  };

  const handleDurationChange = (value) => {
    setDuration(value);
    setShowCustomDuration(value === 'custom');
  };

  return (
    <Paper p="lg" radius="md" withBorder>
      <Stack gap="lg">
        {/* Header */}
        <Group gap="sm">
          <ThemeIcon size="lg" variant="gradient" gradient={{ from: 'teal', to: 'cyan' }}>
            <Brain size={20} />
          </ThemeIcon>
          <div>
            <Text fw={600} size="lg">Quick Route</Text>
            <Text size="sm" c="dimmed">Get a route in seconds</Text>
          </div>
        </Group>

        {/* Question 1: Location */}
        <div>
          <Text fw={500} size="sm" mb="xs">
            <MapPin size={14} style={{ display: 'inline', marginRight: 4 }} />
            Where are you starting from?
          </Text>
          <Group gap="xs">
            <TextInput
              placeholder="Enter address or use current location"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && geocodeAddress()}
              style={{ flex: 1 }}
              rightSection={geocoding ? <Loader size="xs" /> : null}
            />
            <Button
              variant="light"
              onClick={geocodeAddress}
              loading={geocoding}
              disabled={!addressInput.trim()}
            >
              Search
            </Button>
          </Group>
          <Group gap="xs" mt="xs">
            <Button
              variant="subtle"
              size="xs"
              leftSection={<Navigation size={12} />}
              onClick={detectCurrentLocation}
              loading={detectingLocation}
            >
              Use my location
            </Button>
            {currentAddress && (
              <Text size="xs" c="dimmed" lineClamp={1}>
                📍 {currentAddress}
              </Text>
            )}
          </Group>
        </div>

        <Divider />

        {/* Question 2: Duration */}
        <div>
          <Text fw={500} size="sm" mb="xs">
            <Clock size={14} style={{ display: 'inline', marginRight: 4 }} />
            How long do you have?
          </Text>
          <SegmentedControl
            value={duration}
            onChange={handleDurationChange}
            fullWidth
            data={[
              { label: '30 min', value: '30' },
              { label: '1 hour', value: '60' },
              { label: '2 hours', value: '120' },
              { label: 'Custom', value: 'custom' },
            ]}
          />
          <Collapse in={showCustomDuration}>
            <NumberInput
              mt="sm"
              label="Duration (minutes)"
              value={customDuration}
              onChange={setCustomDuration}
              min={15}
              max={480}
              step={15}
            />
          </Collapse>
        </div>

        {/* Error display */}
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}

        {/* Generate button with progress status */}
        {generating ? (
          <Paper p="md" radius="md" withBorder style={{ textAlign: 'center' }}>
            <Loader size="sm" mb="xs" />
            <Text size="sm" fw={500}>{generationStatus || 'Generating route...'}</Text>
            <Text size="xs" c="dimmed" mt={4}>This may take 10-30 seconds</Text>
          </Paper>
        ) : (
          <Button
            size="lg"
            variant="gradient"
            gradient={{ from: 'teal', to: 'cyan' }}
            onClick={handleGenerate}
            disabled={!startLocation}
            fullWidth
          >
            Generate Route
          </Button>
        )}

        {/* Link to advanced options */}
        {onShowAdvanced && (
          <Button
            variant="subtle"
            size="sm"
            leftSection={<Settings size={14} />}
            onClick={onShowAdvanced}
            c="dimmed"
          >
            Advanced options (terrain, training goals, etc.)
          </Button>
        )}
      </Stack>
    </Paper>
  );
};

export default QuickRouteGenerator;
