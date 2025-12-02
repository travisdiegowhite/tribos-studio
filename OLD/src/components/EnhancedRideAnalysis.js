import React, { useState, useEffect, useMemo } from 'react';
import {
  Paper,
  Title,
  Group,
  Stack,
  Card,
  Text,
  SimpleGrid,
  ThemeIcon,
  Center,
  Loader,
  Select,
  ScrollArea,
  Badge,
  Modal,
  Button,
  Tabs,
  Progress,
  Divider,
  NumberFormatter,
  Tooltip
} from '@mantine/core';
import {
  BarChart3,
  Route,
  MapPin,
  Mountain,
  Clock,
  TrendingUp,
  Filter,
  Map as MapIcon,
  Eye,
  Heart,
  Zap,
  Activity,
  Target,
  Flame,
  Award,
  Calendar,
  Timer,
  Gauge,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import dayjs from 'dayjs';
import { useAuth } from '../contexts/AuthContext';
import { useUnits } from '../utils/units';
import { supabase } from '../supabase';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  ComposedChart, 
  Tooltip as ChartTooltip, 
  Legend,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from 'recharts';
import toast from 'react-hot-toast';
import RouteMap from './RouteMap';

const EnhancedRideAnalysis = () => {
  const { user } = useAuth();
  const { formatDistance, formatElevation } = useUnits();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('all');
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [routeTrackPoints, setRouteTrackPoints] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('Fetching enhanced routes for user:', user.id);
        
        // Get routes with comprehensive Strava data from enhanced schema
        const { data: routesData, error: routesError } = await supabase
          .from('routes')
          .select(`
            id,
            name,
            description,
            activity_type,
            strava_id,
            imported_from,
            distance_km,
            duration_seconds,
            elevation_gain_m,
            elevation_loss_m,
            average_speed,
            max_speed,
            average_pace,
            average_heartrate,
            max_heartrate,
            hr_zones,
            average_watts,
            max_watts,
            normalized_power,
            intensity_factor,
            training_stress_score,
            kilojoules,
            start_latitude,
            start_longitude,
            end_latitude,
            end_longitude,
            bounds_north,
            bounds_south,
            bounds_east,
            bounds_west,
            temperature,
            weather_condition,
            surface_type,
            route_type,
            difficulty_rating,
            has_gps_data,
            has_heart_rate_data,
            has_power_data,
            has_cadence_data,
            recorded_at,
            uploaded_at,
            created_at,
            updated_at,
            training_goal,
            effort_level,
            tags,
            strava_url,
            track_points_count
          `)
          .eq('user_id', user.id)
          .order('recorded_at', { ascending: false });

        if (routesError) {
          console.error('Routes fetch error:', routesError);
          throw routesError;
        }

        console.log('Enhanced routes fetched:', routesData?.length);
        if (routesData?.[0]) {
          console.log('Sample enhanced route:', routesData[0]);
          console.log('Available fields:', Object.keys(routesData[0]));
        }
        
        setRoutes(routesData || []);
      } catch (error) {
        console.error('Error fetching enhanced data:', error);
        toast.error('Failed to load ride analysis data');
      } finally {
        setLoading(false);
      }
    };

    if (user) fetchData();
  }, [user]);

  // Filter routes by time
  const filteredRoutes = routes.filter(route => {
    if (timeFilter === 'all') return true;
    
    const routeDate = new Date(route.recorded_at || route.created_at);
    const now = new Date();
    
    switch (timeFilter) {
      case '30d':
        return routeDate >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d':
        return routeDate >= new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case 'year':
        return routeDate >= new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      default:
        return true;
    }
  });

  // Separate Strava and manual routes
  const stravaRoutes = filteredRoutes.filter(r => r.imported_from === 'strava');
  const manualRoutes = filteredRoutes.filter(r => r.imported_from !== 'strava');

  // Enhanced statistics with comprehensive performance metrics
  const stats = useMemo(() => {
    const base = {
      totalRoutes: filteredRoutes.length,
      stravaRoutes: stravaRoutes.length,
      totalDistance: filteredRoutes.reduce((sum, r) => sum + (r.distance_km || 0), 0),
      totalElevation: filteredRoutes.reduce((sum, r) => sum + (r.elevation_gain_m || 0), 0),
      totalTime: filteredRoutes.reduce((sum, r) => sum + (r.duration_seconds || 0), 0),
      longestRide: Math.max(...filteredRoutes.map(r => r.distance_km || 0), 0),
      highestElevation: Math.max(...filteredRoutes.map(r => r.elevation_gain_m || 0), 0),
      totalTrackPoints: filteredRoutes.reduce((sum, r) => sum + (r.track_points_count || 0), 0)
    };

    // Performance metrics (from enhanced Strava data)
    const routesWithSpeed = stravaRoutes.filter(r => r.average_speed);
    const routesWithHR = stravaRoutes.filter(r => r.average_heartrate);
    const routesWithPower = stravaRoutes.filter(r => r.average_watts);
    const routesWithNormalizedPower = stravaRoutes.filter(r => r.normalized_power);
    const routesWithEnergy = stravaRoutes.filter(r => r.kilojoules);
    const routesWithTSS = stravaRoutes.filter(r => r.training_stress_score);
    
    // Training goal distribution (with null safety)
    const trainingGoals = {};
    filteredRoutes.forEach(r => {
      if (r.training_goal) {
        trainingGoals[r.training_goal] = (trainingGoals[r.training_goal] || 0) + 1;
      }
    });
    
    // Route type distribution (with null safety)
    const routeTypes = {};
    filteredRoutes.forEach(r => {
      if (r.route_type) {
        routeTypes[r.route_type] = (routeTypes[r.route_type] || 0) + 1;
      }
    });
    
    // Surface type distribution (with null safety)
    const surfaceTypes = {};
    filteredRoutes.forEach(r => {
      if (r.surface_type) {
        surfaceTypes[r.surface_type] = (surfaceTypes[r.surface_type] || 0) + 1;
      }
    });

    return {
      ...base,
      avgDistance: base.totalRoutes > 0 ? base.totalDistance / base.totalRoutes : 0,
      avgSpeed: routesWithSpeed.length > 0 
        ? routesWithSpeed.reduce((sum, r) => sum + r.average_speed, 0) / routesWithSpeed.length
        : null,
      maxSpeed: Math.max(...stravaRoutes.map(r => r.max_speed || 0), 0) || null,
      avgHeartRate: routesWithHR.length > 0
        ? routesWithHR.reduce((sum, r) => sum + r.average_heartrate, 0) / routesWithHR.length
        : null,
      maxHeartRate: Math.max(...stravaRoutes.map(r => r.max_heartrate || 0), 0) || null,
      avgPower: routesWithPower.length > 0
        ? routesWithPower.reduce((sum, r) => sum + r.average_watts, 0) / routesWithPower.length
        : null,
      maxPower: Math.max(...stravaRoutes.map(r => r.max_watts || 0), 0) || null,
      avgNormalizedPower: routesWithNormalizedPower.length > 0
        ? routesWithNormalizedPower.reduce((sum, r) => sum + r.normalized_power, 0) / routesWithNormalizedPower.length
        : null,
      avgTSS: routesWithTSS.length > 0
        ? routesWithTSS.reduce((sum, r) => sum + r.training_stress_score, 0) / routesWithTSS.length
        : null,
      totalTSS: routesWithTSS.reduce((sum, r) => sum + (r.training_stress_score || 0), 0),
      totalEnergy: routesWithEnergy.reduce((sum, r) => sum + (r.kilojoules || 0), 0),
      trainingGoals,
      routeTypes,
      surfaceTypes,
      dataQuality: {
        withGPS: filteredRoutes.filter(r => r.has_gps_data).length,
        withHR: filteredRoutes.filter(r => r.has_heart_rate_data).length,
        withPower: filteredRoutes.filter(r => r.has_power_data).length,
        withCadence: filteredRoutes.filter(r => r.has_cadence_data).length,
        fromStrava: stravaRoutes.length,
        withTrackPoints: filteredRoutes.filter(r => (r.track_points_count && r.track_points_count > 0)).length
      }
    };
  }, [filteredRoutes, stravaRoutes]);

  // Monthly performance trends
  const monthlyTrends = useMemo(() => {
    if (stravaRoutes.length === 0) return [];
    
    const monthlyData = {};
    
    stravaRoutes.forEach(route => {
      const month = dayjs(route.recorded_at).format('YYYY-MM');
      if (!monthlyData[month]) {
        monthlyData[month] = {
          month,
          monthName: dayjs(route.recorded_at).format('MMM YYYY'),
          rides: 0,
          distance: 0,
          time: 0,
          elevation: 0,
          speeds: [],
          heartRates: [],
          powers: [],
          energy: 0
        };
      }
      
      const data = monthlyData[month];
      data.rides += 1;
      data.distance += route.distance_km || 0;
      data.time += route.duration_seconds || 0;
      data.elevation += route.elevation_gain_m || 0;
      data.energy += route.kilojoules || 0;
      
      if (route.average_speed) data.speeds.push(route.average_speed);
      if (route.average_heartrate) data.heartRates.push(route.average_heartrate);
      if (route.average_watts) data.powers.push(route.average_watts);
    });
    
    return Object.values(monthlyData)
      .map(month => ({
        ...month,
        avgSpeed: month.speeds.length > 0 ? month.speeds.reduce((a, b) => a + b, 0) / month.speeds.length : 0,
        avgHR: month.heartRates.length > 0 ? month.heartRates.reduce((a, b) => a + b, 0) / month.heartRates.length : 0,
        avgPower: month.powers.length > 0 ? month.powers.reduce((a, b) => a + b, 0) / month.powers.length : 0
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12); // Last 12 months
  }, [stravaRoutes]);

  // Performance zones analysis
  const performanceZones = useMemo(() => {
    if (stravaRoutes.length === 0) return null;
    
    const speedRanges = [
      { name: 'Easy', min: 0, max: 20, color: '#51cf66' },
      { name: 'Moderate', min: 20, max: 25, color: '#ffd43b' },
      { name: 'Fast', min: 25, max: 30, color: '#ff922b' },
      { name: 'Very Fast', min: 30, max: 100, color: '#ff6b6b' }
    ];
    
    const speedDistribution = speedRanges.map(range => ({
      ...range,
      count: stravaRoutes.filter(r => 
        r.average_speed >= range.min && r.average_speed < range.max
      ).length
    }));

    // Heart rate zones (if available)
    const hrZones = [];
    const routesWithHR = stravaRoutes.filter(r => r.average_heartrate);
    if (routesWithHR.length > 0) {
      const maxHR = Math.max(...routesWithHR.map(r => r.max_heartrate || r.average_heartrate));
      const zones = [
        { name: 'Zone 1 (50-60%)', min: maxHR * 0.5, max: maxHR * 0.6, color: '#51cf66' },
        { name: 'Zone 2 (60-70%)', min: maxHR * 0.6, max: maxHR * 0.7, color: '#74c0fc' },
        { name: 'Zone 3 (70-80%)', min: maxHR * 0.7, max: maxHR * 0.8, color: '#ffd43b' },
        { name: 'Zone 4 (80-90%)', min: maxHR * 0.8, max: maxHR * 0.9, color: '#ff922b' },
        { name: 'Zone 5 (90%+)', min: maxHR * 0.9, max: maxHR * 1.1, color: '#ff6b6b' }
      ];
      
      hrZones.push(...zones.map(zone => ({
        ...zone,
        count: routesWithHR.filter(r => 
          r.average_heartrate >= zone.min && r.average_heartrate < zone.max
        ).length
      })));
    }
    
    return { speedDistribution, hrZones };
  }, [stravaRoutes]);

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const formatSpeed = (kmh) => {
    return `${kmh.toFixed(1)} km/h`;
  };

  if (loading) {
    return (
      <Center style={{ height: '50vh' }}>
        <Stack align="center">
          <Loader size="lg" />
          <Text c="dimmed">Loading your performance data...</Text>
        </Stack>
      </Center>
    );
  }

  if (routes.length === 0) {
    return (
      <Center style={{ height: '50vh' }}>
        <Stack align="center">
          <Activity size={48} color="gray" />
          <Title order={3}>No activities yet</Title>
          <Text c="dimmed">Connect Strava or upload routes to see your analysis</Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between">
        <div>
          <Title order={2}>
            <Group gap="sm">
              <BarChart3 size={28} />
              Ride Analysis
            </Group>
          </Title>
          <Text c="dimmed">
            Performance insights from {stats.stravaRoutes} Strava activities and {stats.totalRoutes - stats.stravaRoutes} manual routes
          </Text>
        </div>
        
        <Select
          value={timeFilter}
          onChange={setTimeFilter}
          data={[
            { value: 'all', label: 'All time' },
            { value: '30d', label: 'Last 30 days' },
            { value: '90d', label: 'Last 90 days' },
            { value: 'year', label: 'Last year' }
          ]}
          leftSection={<Filter size={16} />}
        />
      </Group>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="overview" leftSection={<BarChart3 size={16} />}>
            Overview
          </Tabs.Tab>
          <Tabs.Tab value="performance" leftSection={<Zap size={16} />}>
            Performance
          </Tabs.Tab>
          <Tabs.Tab value="trends" leftSection={<TrendingUp size={16} />}>
            Trends
          </Tabs.Tab>
          <Tabs.Tab value="activities" leftSection={<Route size={16} />}>
            Activities
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="md">
          {/* Key Metrics Grid */}
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mb="lg">
            <Card padding="md" withBorder>
              <Group justify="space-between">
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Rides</Text>
                  <Text fw={700} size="xl">{stats.totalRoutes}</Text>
                  <Text size="xs" c="blue">{stats.stravaRoutes} from Strava</Text>
                </div>
                <ThemeIcon size={38} variant="light" color="blue">
                  <Route size={20} />
                </ThemeIcon>
              </Group>
            </Card>

            <Card padding="md" withBorder>
              <Group justify="space-between">
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Distance</Text>
                  <Text fw={700} size="xl">{formatDistance(stats.totalDistance)}</Text>
                  <Text size="xs" c="green">Avg: {formatDistance(stats.avgDistance)}</Text>
                </div>
                <ThemeIcon size={38} variant="light" color="green">
                  <MapPin size={20} />
                </ThemeIcon>
              </Group>
            </Card>

            <Card padding="md" withBorder>
              <Group justify="space-between">
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Elevation</Text>
                  <Text fw={700} size="xl">{formatElevation(stats.totalElevation)}</Text>
                  <Text size="xs" c="orange">Max: {formatElevation(stats.highestElevation)}</Text>
                </div>
                <ThemeIcon size={38} variant="light" color="orange">
                  <Mountain size={20} />
                </ThemeIcon>
              </Group>
            </Card>

            <Card padding="md" withBorder>
              <Group justify="space-between">
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Total Time</Text>
                  <Text fw={700} size="xl">{formatDuration(stats.totalTime)}</Text>
                  {stats.totalEnergy > 0 && (
                    <Text size="xs" c="violet">{Math.round(stats.totalEnergy).toLocaleString()} kJ</Text>
                  )}
                </div>
                <ThemeIcon size={38} variant="light" color="violet">
                  <Clock size={20} />
                </ThemeIcon>
              </Group>
            </Card>
          </SimpleGrid>

          {/* Performance Metrics (Strava Data) */}
          {stats.stravaRoutes > 0 && (
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mb="lg">
              <Card padding="md" withBorder bg="blue.0">
                <Group justify="space-between">
                  <div>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Avg Speed</Text>
                    <Text fw={700} size="lg" c="blue">
                      {stats.avgSpeed ? formatSpeed(stats.avgSpeed) : 'N/A'}
                    </Text>
                    {stats.maxSpeed && (
                      <Text size="xs" c="dimmed">Max: {formatSpeed(stats.maxSpeed)}</Text>
                    )}
                  </div>
                  <ThemeIcon size={38} variant="light" color="blue">
                    <Gauge size={20} />
                  </ThemeIcon>
                </Group>
              </Card>

              {stats.avgHeartRate && (
                <Card padding="md" withBorder bg="red.0">
                  <Group justify="space-between">
                    <div>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Avg Heart Rate</Text>
                      <Text fw={700} size="lg" c="red">
                        {Math.round(stats.avgHeartRate)} bpm
                      </Text>
                      <Text size="xs" c="dimmed">Max: {stats.maxHeartRate} bpm</Text>
                    </div>
                    <ThemeIcon size={38} variant="light" color="red">
                      <Heart size={20} />
                    </ThemeIcon>
                  </Group>
                </Card>
              )}

              {stats.avgPower && (
                <Card padding="md" withBorder bg="yellow.0">
                  <Group justify="space-between">
                    <div>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Avg Power</Text>
                      <Text fw={700} size="lg" c="yellow.8">
                        {Math.round(stats.avgPower)} W
                      </Text>
                      <Text size="xs" c="dimmed">
                        {stats.avgNormalizedPower ? `NP: ${Math.round(stats.avgNormalizedPower)}W` : `Max: ${stats.maxPower}W`}
                      </Text>
                    </div>
                    <ThemeIcon size={38} variant="light" color="yellow">
                      <Zap size={20} />
                    </ThemeIcon>
                  </Group>
                </Card>
              )}

              <Card padding="md" withBorder bg="green.0">
                <Group justify="space-between">
                  <div>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>Data Quality</Text>
                    <Group gap="xs">
                      <Badge size="xs" color="blue">{stats.dataQuality.fromStrava} Strava</Badge>
                      <Badge size="xs" color="red">{stats.dataQuality.withHR} HR</Badge>
                      <Badge size="xs" color="yellow">{stats.dataQuality.withPower} Power</Badge>
                      {stats.dataQuality.withCadence > 0 && (
                        <Badge size="xs" color="cyan">{stats.dataQuality.withCadence} Cadence</Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {Math.round((stats.stravaRoutes / stats.totalRoutes) * 100)}% enhanced • 
                      {stats.totalTrackPoints.toLocaleString()} track points
                    </Text>
                  </div>
                  <ThemeIcon size={38} variant="light" color="green">
                    <Award size={20} />
                  </ThemeIcon>
                </Group>
              </Card>
            </SimpleGrid>
          )}

          {/* Training Goals and Route Types Analysis */}
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md" mb="lg">
            {/* Training Goals Distribution */}
            {Object.keys(stats.trainingGoals).length > 0 && (
              <Card withBorder p="md">
                <Text fw={600} mb="sm">Training Goals</Text>
                <Stack gap="xs">
                  {Object.entries(stats.trainingGoals)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 4)
                    .map(([goal, count]) => (
                    <Group key={goal} justify="space-between">
                      <Text size="sm" tt="capitalize">{goal.replace('_', ' ')}</Text>
                      <Badge size="sm" variant="light">{count}</Badge>
                    </Group>
                  ))}
                </Stack>
              </Card>
            )}
            
            {/* Route Types */}
            {Object.keys(stats.routeTypes).length > 0 && (
              <Card withBorder p="md">
                <Text fw={600} mb="sm">Route Types</Text>
                <Stack gap="xs">
                  {Object.entries(stats.routeTypes)
                    .sort(([,a], [,b]) => b - a)
                    .map(([type, count]) => (
                    <Group key={type} justify="space-between">
                      <Text size="sm" tt="capitalize">{type.replace('_', ' ')}</Text>
                      <Badge size="sm" variant="light">{count}</Badge>
                    </Group>
                  ))}
                </Stack>
              </Card>
            )}
            
            {/* Surface Types */}
            {Object.keys(stats.surfaceTypes).length > 0 && (
              <Card withBorder p="md">
                <Text fw={600} mb="sm">Surface Types</Text>
                <Stack gap="xs">
                  {Object.entries(stats.surfaceTypes)
                    .sort(([,a], [,b]) => b - a)
                    .map(([surface, count]) => (
                    <Group key={surface} justify="space-between">
                      <Text size="sm" tt="capitalize">{surface}</Text>
                      <Badge size="sm" variant="light">{count}</Badge>
                    </Group>
                  ))}
                </Stack>
              </Card>
            )}
          </SimpleGrid>

          {/* Data Quality Indicator */}
          <Card withBorder p="md" bg="gray.0">
            <Group justify="space-between" mb="sm">
              <Text fw={600}>Data Enhancement Progress</Text>
              <Badge variant="light" color="blue">
                {stats.stravaRoutes}/{stats.totalRoutes} activities enhanced
              </Badge>
            </Group>
            <Progress 
              value={(stats.stravaRoutes / stats.totalRoutes) * 100} 
              size="lg" 
              color="blue"
              mb="xs"
            />
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Connect Strava to unlock advanced performance metrics
              </Text>
              <Text size="xs" c="dimmed">
                {stats.dataQuality.withTrackPoints} routes with GPS tracks
              </Text>
            </Group>
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="performance" pt="md">
          {stats.stravaRoutes === 0 ? (
            <Card withBorder p="xl">
              <Stack align="center">
                <Activity size={48} color="gray" />
                <Title order={4}>Performance Data Unavailable</Title>
                <Text c="dimmed" ta="center">
                  Connect Strava to unlock detailed performance analysis including heart rate zones, 
                  power metrics, and speed distribution charts.
                </Text>
              </Stack>
            </Card>
          ) : (
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              {/* Speed Distribution */}
              {performanceZones && (
                <Card withBorder p="md">
                  <Title order={5} mb="md">Speed Distribution</Title>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={performanceZones.speedDistribution}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="count"
                        label={({ name, count }) => count > 0 ? `${name}: ${count}` : ''}
                      >
                        {performanceZones.speedDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <ChartTooltip formatter={(value) => [`${value} rides`, 'Count']} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Heart Rate Zones */}
              {performanceZones?.hrZones.length > 0 && (
                <Card withBorder p="md">
                  <Title order={5} mb="md">Heart Rate Zones</Title>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={performanceZones.hrZones}>
                      <XAxis dataKey="name" fontSize={14} height={50} />
                      <YAxis fontSize={14} width={60} />
                      <ChartTooltip formatter={(value) => [`${value} rides`, 'Count']} />
                      <Bar dataKey="count" fill="#ff6b6b" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Performance Scatter Plot */}
              {stats.avgSpeed && stats.avgPower && (
                <Card withBorder p="md">
                  <Title order={5} mb="md">Speed vs Power</Title>
                  <ResponsiveContainer width="100%" height={250}>
                    <ScatterChart
                      data={stravaRoutes
                        .filter(r => r.average_speed && r.average_watts)
                        .map(r => ({
                          speed: r.average_speed,
                          power: r.average_watts,
                          name: r.name
                        }))
                      }
                    >
                      <XAxis dataKey="speed" name="Speed" unit=" km/h" fontSize={14} height={60} />
                      <YAxis dataKey="power" name="Power" unit=" W" fontSize={14} width={80} />
                      <ChartTooltip cursor={{ strokeDasharray: '3 3' }} />
                      <Scatter dataKey="power" fill="#ffd43b" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Energy and Training Stress Analysis */}
              {stats.totalEnergy > 0 && (
                <Card withBorder p="md">
                  <Title order={5} mb="md">Training Load Analysis</Title>
                  <Stack gap="md">
                    <Group justify="space-between">
                      <Text>Total Energy Burned</Text>
                      <Text fw={700} c="orange">
                        <NumberFormatter value={stats.totalEnergy} thousandSeparator suffix=" kJ" />
                      </Text>
                    </Group>
                    <Group justify="space-between">
                      <Text>Avg per Ride</Text>
                      <Text fw={600}>
                        <NumberFormatter 
                          value={stats.totalEnergy / stravaRoutes.filter(r => r.kilojoules).length} 
                          thousandSeparator 
                          decimalScale={0}
                          suffix=" kJ" 
                        />
                      </Text>
                    </Group>
                    {stats.avgTSS && (
                      <Group justify="space-between">
                        <Tooltip label="Training Stress Score - measures workout intensity and duration">
                          <Text>Avg TSS</Text>
                        </Tooltip>
                        <Text fw={600} c="blue">{Math.round(stats.avgTSS)}</Text>
                      </Group>
                    )}
                    {stats.totalTSS > 0 && (
                      <Group justify="space-between">
                        <Text>Total TSS</Text>
                        <Text fw={700} c="blue">{Math.round(stats.totalTSS)}</Text>
                      </Group>
                    )}
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">Estimated Calories</Text>
                      <Text size="sm" c="dimmed">
                        ~{Math.round(stats.totalEnergy * 0.24).toLocaleString()} kcal
                      </Text>
                    </Group>
                  </Stack>
                </Card>
              )}
            </SimpleGrid>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="trends" pt="md">
          {monthlyTrends.length === 0 ? (
            <Card withBorder p="xl">
              <Stack align="center">
                <TrendingUp size={48} color="gray" />
                <Title order={4}>Trend Data Unavailable</Title>
                <Text c="dimmed" ta="center">
                  Need more Strava activities to show meaningful trends. 
                  Import your Strava history to see monthly progress.
                </Text>
              </Stack>
            </Card>
          ) : (
            <Stack gap="lg">
              {/* Monthly Distance Trend */}
              <Card withBorder p="md">
                <Title order={5} mb="md">Monthly Distance Trend</Title>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={monthlyTrends}>
                    <XAxis dataKey="monthName" fontSize={14} height={50} />
                    <YAxis fontSize={14} width={80} />
                    <ChartTooltip formatter={(value) => [formatDistance(value), 'Distance']} />
                    <Area 
                      type="monotone" 
                      dataKey="distance" 
                      stroke="#228be6" 
                      fill="#228be6" 
                      fillOpacity={0.6} 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              {/* Performance Trends */}
              {monthlyTrends.some(m => m.avgSpeed > 0) && (
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                  <Card withBorder p="md">
                    <Title order={5} mb="md">Speed Trend</Title>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={monthlyTrends}>
                        <XAxis dataKey="monthName" fontSize={14} height={50} />
                        <YAxis fontSize={14} width={80} />
                        <ChartTooltip formatter={(value) => [formatSpeed(value), 'Avg Speed']} />
                        <Line 
                          type="monotone" 
                          dataKey="avgSpeed" 
                          stroke="#51cf66" 
                          strokeWidth={3}
                          dot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>

                  {monthlyTrends.some(m => m.avgHR > 0) && (
                    <Card withBorder p="md">
                      <Title order={5} mb="md">Heart Rate Trend</Title>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={monthlyTrends}>
                          <XAxis dataKey="monthName" fontSize={14} height={50} />
                          <YAxis fontSize={14} width={80} />
                          <ChartTooltip formatter={(value) => [`${Math.round(value)} bpm`, 'Avg HR']} />
                          <Line 
                            type="monotone" 
                            dataKey="avgHR" 
                            stroke="#ff6b6b" 
                            strokeWidth={3}
                            dot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </Card>
                  )}
                </SimpleGrid>
              )}
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="activities" pt="md">
          <Card withBorder p="md">
            <Group justify="space-between" mb="md">
              <Title order={5}>Recent Activities</Title>
              <Badge variant="light">{filteredRoutes.length} activities</Badge>
            </Group>
            
            <ScrollArea style={{ height: 500 }}>
              <Stack gap="xs">
                {filteredRoutes.slice(0, 50).map((route) => (
                  <Card key={route.id} padding="sm" withBorder>
                    <Group justify="space-between">
                      <div>
                        <Group gap="xs">
                          <Text fw={500} size="sm">{route.name || 'Unnamed Route'}</Text>
                          {route.imported_from === 'strava' && (
                            <Badge size="xs" color="orange">Strava</Badge>
                          )}
                          {route.has_heart_rate_data && (
                            <Badge size="xs" color="red">HR</Badge>
                          )}
                          {route.has_power_data && (
                            <Badge size="xs" color="yellow">Power</Badge>
                          )}
                        </Group>
                        <Group gap="xs">
                          <Text size="xs" c="dimmed">
                            {dayjs(route.recorded_at || route.created_at).format('MMM D, YYYY')}
                          </Text>
                          {route.training_goal && (
                            <Badge size="xs" variant="light" color="grape">
                              {route.training_goal}
                            </Badge>
                          )}
                          {route.route_type && (
                            <Badge size="xs" variant="light" color="teal">
                              {route.route_type.replace('_', ' ')}
                            </Badge>
                          )}
                          {route.difficulty_rating && (
                            <Badge size="xs" variant="light" color="red">
                              L{route.difficulty_rating}
                            </Badge>
                          )}
                        </Group>
                      </div>
                      
                      <Group gap="md">
                        <Text size="xs">{formatDistance(route.distance_km || 0)}</Text>
                        <Text size="xs">↗ {formatElevation(route.elevation_gain_m || 0)}</Text>
                        {route.duration_seconds && (
                          <Text size="xs">{formatDuration(route.duration_seconds)}</Text>
                        )}
                        {route.average_speed && (
                          <Text size="xs">{formatSpeed(route.average_speed)}</Text>
                        )}
                        {route.strava_url && (
                          <Button
                            size="xs"
                            variant="light"
                            component="a"
                            href={route.strava_url}
                            target="_blank"
                            color="orange"
                          >
                            Strava
                          </Button>
                        )}
                      </Group>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </ScrollArea>
          </Card>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
};

export default EnhancedRideAnalysis;