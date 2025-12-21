import { useState, useEffect, useMemo } from 'react';
import { Paper, Text, Group, Badge, Stack, Box, Loader, Tooltip, Progress, ActionIcon } from '@mantine/core';
import { IconWind, IconTemperature, IconDroplet, IconEye, IconRefresh, IconCloud } from '@tabler/icons-react';
import { tokens } from '../theme';
import {
  getWeatherData,
  getWeatherSeverity,
  analyzeWindForRoute,
  formatTemperature,
  formatWindSpeed
} from '../utils/weather';

/**
 * Wind direction arrow component
 */
function WindArrow({ degrees, size = 24 }) {
  // Rotate arrow to show wind direction (where it's coming FROM)
  const rotation = degrees || 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.3s ease' }}
    >
      <path
        d="M12 2L8 10h3v10h2V10h3L12 2z"
        fill={tokens.colors.electricLime}
      />
    </svg>
  );
}

/**
 * Compact weather badge for map overlay
 */
export function WeatherBadge({ weather, isImperial = true, onClick }) {
  if (!weather) return null;

  const severity = getWeatherSeverity(weather, null, isImperial);

  return (
    <Tooltip label={severity.message} position="bottom">
      <Badge
        variant="filled"
        color={severity.color}
        size="lg"
        leftSection={<IconCloud size={14} />}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
        onClick={onClick}
      >
        {formatTemperature(weather.temperature, isImperial)} | {formatWindSpeed(weather.windSpeed, isImperial)} {weather.windDirection}
      </Badge>
    </Tooltip>
  );
}

/**
 * Wind analysis panel for a route
 */
export function WindAnalysisPanel({ coordinates, weather, isImperial = true }) {
  const analysis = useMemo(() => {
    if (!coordinates || coordinates.length < 2 || !weather?.windDegrees) {
      return null;
    }
    return analyzeWindForRoute(coordinates, weather.windDegrees, weather.windSpeed);
  }, [coordinates, weather]);

  if (!analysis || !weather) {
    return null;
  }

  const getWindColor = (type) => {
    switch (type) {
      case 'tailwind':
      case 'tailwind-dominant':
      case 'quartering-tail':
        return 'green';
      case 'headwind':
      case 'headwind-dominant':
      case 'quartering-head':
        return 'red';
      case 'crosswind':
      case 'crosswind-dominant':
        return 'yellow';
      default:
        return 'gray';
    }
  };

  const getWindIcon = (type) => {
    if (type.includes('tail')) return '+';
    if (type.includes('head')) return '-';
    return '~';
  };

  return (
    <Paper p="xs" style={{ backgroundColor: tokens.colors.bgTertiary }}>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <WindArrow degrees={weather.windDegrees} size={20} />
          <Text size="sm" fw={500} style={{ color: tokens.colors.textPrimary }}>
            Wind Analysis
          </Text>
        </Group>
        <Badge size="xs" color={getWindColor(analysis.overall.type)} variant="light">
          {analysis.overall.description}
        </Badge>
      </Group>

      <Stack gap={4}>
        {analysis.percentages.tailwind > 0 && (
          <Group gap="xs">
            <Text size="xs" w={70} c="dimmed">Tailwind:</Text>
            <Progress
              value={analysis.percentages.tailwind}
              color="green"
              size="sm"
              style={{ flex: 1 }}
            />
            <Text size="xs" w={30} ta="right" c="green">{analysis.percentages.tailwind}%</Text>
          </Group>
        )}
        {analysis.percentages.headwind > 0 && (
          <Group gap="xs">
            <Text size="xs" w={70} c="dimmed">Headwind:</Text>
            <Progress
              value={analysis.percentages.headwind}
              color="red"
              size="sm"
              style={{ flex: 1 }}
            />
            <Text size="xs" w={30} ta="right" c="red">{analysis.percentages.headwind}%</Text>
          </Group>
        )}
        {analysis.percentages.crosswind > 0 && (
          <Group gap="xs">
            <Text size="xs" w={70} c="dimmed">Crosswind:</Text>
            <Progress
              value={analysis.percentages.crosswind}
              color="yellow"
              size="sm"
              style={{ flex: 1 }}
            />
            <Text size="xs" w={30} ta="right" c="yellow">{analysis.percentages.crosswind}%</Text>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}

/**
 * Full weather widget component
 */
const WeatherWidget = ({
  latitude,
  longitude,
  coordinates = null, // Route coordinates for wind analysis
  isImperial = true,
  compact = false,
  showWindAnalysis = true,
  onWeatherUpdate = null,
}) => {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchWeather = async () => {
    if (!latitude || !longitude) return;

    setLoading(true);
    setError(null);

    try {
      const data = await getWeatherData(latitude, longitude);
      if (data) {
        setWeather(data);
        if (onWeatherUpdate) {
          onWeatherUpdate(data);
        }
      } else {
        setError('Unable to fetch weather');
      }
    } catch (err) {
      console.error('Weather fetch error:', err);
      setError('Weather unavailable');
    } finally {
      setLoading(false);
    }
  };

  // Fetch weather when location changes
  useEffect(() => {
    fetchWeather();
  }, [latitude, longitude]);

  if (!latitude || !longitude) {
    return null;
  }

  if (loading && !weather) {
    return (
      <Paper p="sm" style={{ backgroundColor: tokens.colors.bgSecondary }}>
        <Group gap="xs" justify="center">
          <Loader size="xs" color="lime" />
          <Text size="xs" c="dimmed">Loading weather...</Text>
        </Group>
      </Paper>
    );
  }

  if (error && !weather) {
    return (
      <Paper p="sm" style={{ backgroundColor: tokens.colors.bgSecondary }}>
        <Text size="xs" c="dimmed" ta="center">{error}</Text>
      </Paper>
    );
  }

  if (!weather) return null;

  const severity = getWeatherSeverity(weather, null, isImperial);

  // Compact mode for map overlay
  if (compact) {
    return (
      <Paper
        p="xs"
        style={{
          backgroundColor: `${tokens.colors.bgSecondary}ee`,
          backdropFilter: 'blur(8px)',
          border: `1px solid ${tokens.colors.bgTertiary}`,
        }}
      >
        <Group gap="xs" justify="space-between">
          <Group gap="xs">
            <WindArrow degrees={weather.windDegrees} size={18} />
            <Text size="sm" fw={500} style={{ color: tokens.colors.textPrimary }}>
              {formatTemperature(weather.temperature, isImperial)}
            </Text>
            <Text size="xs" c="dimmed">
              {formatWindSpeed(weather.windSpeed, isImperial)} {weather.windDirection}
            </Text>
          </Group>
          <Badge size="xs" color={severity.color} variant="light">
            {weather.description}
          </Badge>
        </Group>
      </Paper>
    );
  }

  // Full widget
  return (
    <Paper p="sm" style={{ backgroundColor: tokens.colors.bgSecondary }}>
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between">
          <Group gap="xs">
            <IconCloud size={18} style={{ color: tokens.colors.textSecondary }} />
            <Text size="sm" fw={600} style={{ color: tokens.colors.textPrimary }}>
              Current Weather
            </Text>
            {weather.location && (
              <Text size="xs" c="dimmed">- {weather.location}</Text>
            )}
          </Group>
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={fetchWeather}
            loading={loading}
          >
            <IconRefresh size={14} />
          </ActionIcon>
        </Group>

        {/* Weather Status */}
        <Badge
          size="lg"
          color={severity.color}
          variant="light"
          fullWidth
        >
          {severity.message}
        </Badge>

        {/* Main Stats */}
        <Group gap="lg" justify="center">
          <Tooltip label={severity.effectiveTemp && severity.effectiveTemp < weather.temperature
            ? `Actual: ${formatTemperature(weather.temperature, isImperial)}, Feels like: ${formatTemperature(severity.effectiveTemp, isImperial)}`
            : "Temperature"
          }>
            <Group gap={4}>
              <IconTemperature size={16} style={{ color: tokens.colors.textMuted }} />
              <Box>
                <Text size="lg" fw={600} style={{ color: tokens.colors.textPrimary }}>
                  {formatTemperature(weather.temperature, isImperial)}
                </Text>
                {severity.effectiveTemp && severity.effectiveTemp < weather.temperature && (
                  <Text size="xs" c="dimmed">
                    Feels {formatTemperature(severity.effectiveTemp, isImperial)}
                  </Text>
                )}
              </Box>
            </Group>
          </Tooltip>

          <Tooltip label={`Wind from ${weather.windDirection}`}>
            <Group gap={4}>
              <WindArrow degrees={weather.windDegrees} size={20} />
              <Box>
                <Text size="sm" fw={600} style={{ color: tokens.colors.textPrimary }}>
                  {formatWindSpeed(weather.windSpeed, isImperial)}
                </Text>
                <Text size="xs" c="dimmed">{weather.windDirection}</Text>
              </Box>
            </Group>
          </Tooltip>

          <Tooltip label="Humidity">
            <Group gap={4}>
              <IconDroplet size={16} style={{ color: tokens.colors.textMuted }} />
              <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                {weather.humidity}%
              </Text>
            </Group>
          </Tooltip>
        </Group>

        {/* Wind Gusts if present */}
        {weather.windGust && weather.windGust > weather.windSpeed && (
          <Text size="xs" c="orange" ta="center">
            Gusts up to {formatWindSpeed(weather.windGust, isImperial)}
          </Text>
        )}

        {/* Wind analysis for route */}
        {showWindAnalysis && coordinates && coordinates.length >= 2 && (
          <WindAnalysisPanel
            coordinates={coordinates}
            weather={weather}
            isImperial={isImperial}
          />
        )}

        {/* Additional details */}
        <Group gap="md" justify="center">
          <Tooltip label="Visibility">
            <Group gap={4}>
              <IconEye size={14} style={{ color: tokens.colors.textMuted }} />
              <Text size="xs" c="dimmed">
                {weather.visibility} km
              </Text>
            </Group>
          </Tooltip>
          <Text size="xs" c="dimmed">
            {weather.description}
          </Text>
        </Group>
      </Stack>
    </Paper>
  );
};

export default WeatherWidget;
