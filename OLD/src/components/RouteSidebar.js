import React from 'react';
import {
  Paper,
  TextInput,
  Button,
  Group,
  Stack,
  Text,
  Badge,
  ActionIcon,
  Tooltip,
  SegmentedControl,
  Switch,
  Progress,
  Card,
  ThemeIcon,
  ScrollArea,
  Timeline,
  Alert,
  Transition,
  Menu,
  UnstyledButton,
  RingProgress,
  Tabs,
  Select,
} from '@mantine/core';
import {
  Navigation2,
  Trash2,
  Download,
  Upload,
  Route,
  Mountain,
  Clock,
  Save,
  ChevronDown,
  ChevronUp,
  X,
  Target,
  MapPin,
  Flag,
  Info,
  Bike,
  Footprints,
  Car,
  ArrowUpDown,
  BarChart3,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Share2,
  Settings,
} from 'lucide-react';

/**
 * RouteSidebar Component
 * Extracted sidebar UI from ProfessionalRouteBuilder for better code organization
 */
const RouteSidebar = ({
  // State
  sidebarCollapsed,
  setSidebarCollapsed,
  activeMode,
  setActiveMode,
  routeName,
  setRouteName,
  routeDescription,
  setRouteDescription,
  waypoints,
  routingProfile,
  setRoutingProfile,
  autoRoute,
  setAutoRoute,
  snappedRoute,
  routeStats,
  elevationStats,
  elevationProfile,
  selectedWaypoint,
  error,
  snapping,
  snapProgress,
  savedRoutes,
  loadingSavedRoutes,
  saving,
  showElevation,
  setShowElevation,
  showGrid,
  setShowGrid,
  showWeather,
  setShowWeather,
  
  // Functions
  onExit,
  snapToRoads,
  reverseRoute,
  clearRoute,
  removeWaypoint,
  fetchSavedRoutes,
  exportGPX,
  importGPX,
  shareRoute,
  saveRoute,
  
  // Formatting functions
  formatDistance,
  formatDuration,
  formatElevation,
}) => {
  return (
    <Transition mounted={!sidebarCollapsed} transition="slide-right" duration={300}>
      {(styles) => (
        <Paper
          shadow="sm"
          style={{
            ...styles,
            width: 400,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 0,
            zIndex: 10,
          }}
        >
          {/* Header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e9ecef' }}>
            <Group justify="space-between" mb="md">
              <Group>
                <ThemeIcon size="lg" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
                  <Route size={20} />
                </ThemeIcon>
                <div>
                  <Text size="lg" fw={600}>Professional Route Builder</Text>
                  <Text size="xs" c="dimmed">Design your perfect ride</Text>
                </div>
              </Group>
              <Group gap="xs">
                {onExit && (
                  <Tooltip label="Exit">
                    <ActionIcon onClick={onExit} variant="subtle">
                      <X size={18} />
                    </ActionIcon>
                  </Tooltip>
                )}
                <Tooltip label="Collapse sidebar">
                  <ActionIcon onClick={() => setSidebarCollapsed(true)} variant="subtle">
                    <ChevronDown size={18} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>

            {/* Mode Selector */}
            <SegmentedControl
              value={activeMode}
              onChange={setActiveMode}
              fullWidth
              data={[
                { label: '✏️ Draw', value: 'draw' },
                { label: '🔧 Edit', value: 'edit' },
                { label: '👁️ View', value: 'view' },
              ]}
            />
            
            <Text size="xs" c="dimmed" ta="center" mt="xs">
              {activeMode === 'draw' && 'Click map to add waypoints'}
              {activeMode === 'edit' && 'Drag waypoints to modify'}
              {activeMode === 'view' && 'Overview mode'}
            </Text>
          </div>

          {/* Main Content */}
          <Tabs defaultValue="route" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Tabs.List>
              <Tabs.Tab value="route" leftSection={<Route size={14} />}>Route</Tabs.Tab>
              <Tabs.Tab value="saved" leftSection={<Save size={14} />}>Saved</Tabs.Tab>
              <Tabs.Tab value="settings" leftSection={<Settings size={14} />}>Settings</Tabs.Tab>
            </Tabs.List>
            
            {/* Route Tab */}
            <Tabs.Panel value="route" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ScrollArea style={{ flex: 1 }} p="md">
                <Stack gap="md">
                  {/* Route Details */}
                  <Card withBorder>
                    <Stack gap="sm">
                      <TextInput
                        placeholder="Route name"
                        value={routeName}
                        onChange={(e) => setRouteName(e.target.value)}
                        leftSection={<Route size={16} />}
                        error={!routeName && waypoints.length > 0 ? 'Name required' : null}
                      />
                      <TextInput
                        placeholder="Description (optional)"
                        value={routeDescription}
                        onChange={(e) => setRouteDescription(e.target.value)}
                        leftSection={<Info size={16} />}
                      />
                    </Stack>
                  </Card>

                  {/* Route Stats */}
                  {waypoints.length > 0 && (
                    <Card withBorder>
                      <Group justify="space-between" mb="sm">
                        <Text fw={500} size="sm">Route Statistics</Text>
                        <Group gap="xs">
                          <Badge size="sm" variant="light" color={
                            routingProfile === 'cycling' ? 'blue' :
                            routingProfile === 'walking' ? 'green' : 'orange'
                          }>
                            {routingProfile === 'cycling' && <Bike size={12} />}
                            {routingProfile === 'walking' && <Footprints size={12} />}
                            {routingProfile === 'driving' && <Car size={12} />}
                          </Badge>
                          {snappedRoute && (
                            <Badge size="sm" variant="light" color="green">
                              Snapped ✓
                            </Badge>
                          )}
                        </Group>
                      </Group>
                      
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Group gap="xs">
                            <Route size={14} />
                            <Text size="sm">Distance</Text>
                          </Group>
                          <Text size="sm" fw={600}>{formatDistance(routeStats.distance / 1000)}</Text>
                        </Group>
                        
                        <Group justify="space-between">
                          <Group gap="xs">
                            <Clock size={14} />
                            <Text size="sm">Duration</Text>
                          </Group>
                          <Text size="sm" fw={600}>{formatDuration(routeStats.duration)}</Text>
                        </Group>
                        
                        {elevationStats && (
                          <>
                            <Group justify="space-between">
                              <Group gap="xs">
                                <Mountain size={14} />
                                <Text size="sm">Elevation</Text>
                              </Group>
                              <Text size="sm" fw={600}>
                                +{formatElevation(routeStats.elevationGain)} / -{formatElevation(routeStats.elevationLoss)}
                              </Text>
                            </Group>
                            
                            <Group justify="space-between">
                              <Group gap="xs">
                                <ArrowUpDown size={14} />
                                <Text size="sm">Grade</Text>
                              </Group>
                              <Text size="sm" fw={600}>
                                avg {routeStats.avgGrade.toFixed(1)}% / max {routeStats.maxGrade.toFixed(1)}%
                              </Text>
                            </Group>
                          </>
                        )}
                        
                        {routeStats.confidence > 0 && (
                          <Group justify="space-between">
                            <Text size="sm">Confidence</Text>
                            <RingProgress
                              size={40}
                              thickness={4}
                              sections={[{ value: routeStats.confidence * 100, color: 'blue' }]}
                              label={
                                <Text size="xs" ta="center">
                                  {Math.round(routeStats.confidence * 100)}%
                                </Text>
                              }
                            />
                          </Group>
                        )}
                      </Stack>
                      
                      {elevationProfile.length > 0 && (
                        <Button
                          variant="light"
                          size="xs"
                          leftSection={<BarChart3 size={12} />}
                          onClick={() => console.log('Elevation profile is now shown inline below!')}
                          mt="xs"
                          fullWidth
                        >
                          View Elevation Profile
                        </Button>
                      )}
                    </Card>
                  )}

                  {/* Waypoints */}
                  {waypoints.length > 0 && (
                    <Card withBorder>
                      <Group justify="space-between" mb="sm">
                        <Text fw={500} size="sm">Waypoints ({waypoints.length})</Text>
                        <Group gap="xs">
                          <Tooltip label="Reverse route">
                            <ActionIcon size="sm" variant="subtle" onClick={reverseRoute}>
                              <ArrowUpDown size={14} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Clear all">
                            <ActionIcon size="sm" variant="subtle" color="red" onClick={clearRoute}>
                              <Trash2 size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Group>
                      
                      <Timeline active={waypoints.length - 1} bulletSize={24} lineWidth={2}>
                        {waypoints.map((wp) => (
                          <Timeline.Item
                            key={wp.id}
                            bullet={
                              wp.type === 'start' ? 
                                <ThemeIcon size={20} color="green" radius="xl">
                                  <Flag size={12} />
                                </ThemeIcon> :
                              wp.type === 'end' ? 
                                <ThemeIcon size={20} color="red" radius="xl">
                                  <Target size={12} />
                                </ThemeIcon> :
                                <ThemeIcon size={20} color="blue" radius="xl">
                                  <MapPin size={12} />
                                </ThemeIcon>
                            }
                            title={
                              <Group justify="space-between">
                                <Text size="sm" fw={selectedWaypoint === wp.id ? 600 : 400}>
                                  {wp.name}
                                </Text>
                                <ActionIcon 
                                  size="xs" 
                                  variant="subtle" 
                                  color="red"
                                  onClick={() => removeWaypoint(wp.id)}
                                >
                                  <X size={12} />
                                </ActionIcon>
                              </Group>
                            }
                          >
                            <Text size="xs" c="dimmed">
                              {wp.position[1].toFixed(5)}, {wp.position[0].toFixed(5)}
                            </Text>
                          </Timeline.Item>
                        ))}
                      </Timeline>
                    </Card>
                  )}

                  {/* Error Display */}
                  {error && (
                    <Alert color="red" icon={<AlertCircle size={16} />}>
                      {error}
                    </Alert>
                  )}

                  {/* Snapping Progress */}
                  {snapping && (
                    <Card withBorder>
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Text size="sm">Snapping to roads...</Text>
                          <Text size="xs" c="dimmed">{Math.round(snapProgress * 100)}%</Text>
                        </Group>
                        <Progress value={snapProgress * 100} size="sm" animated />
                      </Stack>
                    </Card>
                  )}
                </Stack>
              </ScrollArea>
            </Tabs.Panel>
            
            {/* Saved Tab */}
            <Tabs.Panel value="saved" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ScrollArea style={{ flex: 1 }} p="md">
                <Stack gap="md">
                  <Group justify="space-between">
                    <Text fw={500}>Saved Routes</Text>
                    <ActionIcon 
                      size="sm" 
                      variant="subtle" 
                      onClick={fetchSavedRoutes} 
                      loading={loadingSavedRoutes}
                    >
                      <RefreshCw size={16} />
                    </ActionIcon>
                  </Group>
                  
                  {savedRoutes.length === 0 ? (
                    <Text size="sm" c="dimmed" ta="center" py="xl">
                      No saved routes yet
                    </Text>
                  ) : (
                    <Stack gap="xs">
                      {savedRoutes.map(route => (
                        <UnstyledButton
                          key={route.id}
                          style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #e9ecef',
                            transition: 'all 0.2s',
                            '&:hover': { background: '#f8f9fa' }
                          }}
                        >
                          <Group justify="space-between">
                            <div>
                              <Text size="sm" fw={500}>{route.name}</Text>
                              <Group gap="xs" mt={4}>
                                <Badge size="xs" variant="light">
                                  {formatDistance(route.distance)}
                                </Badge>
                                <Badge size="xs" variant="light" color="orange">
                                  +{formatElevation(route.elevation)}
                                </Badge>
                                <Badge size="xs" variant="light" color="violet">
                                  {formatDuration(route.duration)}
                                </Badge>
                                {route.snapped && (
                                  <Badge size="xs" variant="light" color="green">
                                    Snapped
                                  </Badge>
                                )}
                              </Group>
                            </div>
                            <ActionIcon size="sm" variant="subtle">
                              <ExternalLink size={14} />
                            </ActionIcon>
                          </Group>
                        </UnstyledButton>
                      ))}
                    </Stack>
                  )}
                </Stack>
              </ScrollArea>
            </Tabs.Panel>
            
            {/* Settings Tab */}
            <Tabs.Panel value="settings" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <ScrollArea style={{ flex: 1 }} p="md">
                <Stack gap="md">
                  <Card withBorder>
                    <Text fw={500} size="sm" mb="sm">Routing Options</Text>
                    <Stack gap="xs">
                      <Select
                        label="Routing Profile"
                        value={routingProfile}
                        onChange={setRoutingProfile}
                        data={[
                          { value: 'cycling', label: '🚴 Cycling' },
                          { value: 'walking', label: '🚶 Walking' },
                          { value: 'driving', label: '🚗 Driving' },
                        ]}
                        size="sm"
                      />
                      
                      <Switch
                        label="Auto-route between points"
                        description="Automatically snap to roads"
                        checked={autoRoute}
                        onChange={(e) => setAutoRoute(e.currentTarget.checked)}
                        size="sm"
                      />
                    </Stack>
                  </Card>
                  
                  <Card withBorder>
                    <Text fw={500} size="sm" mb="sm">Display Options</Text>
                    <Stack gap="xs">
                      <Switch
                        label="Show elevation profile"
                        checked={showElevation}
                        onChange={(e) => setShowElevation(e.currentTarget.checked)}
                        size="sm"
                      />
                      
                      <Switch
                        label="Show grid overlay"
                        checked={showGrid}
                        onChange={(e) => setShowGrid(e.currentTarget.checked)}
                        size="sm"
                      />
                      
                      <Switch
                        label="Show weather layer"
                        checked={showWeather}
                        onChange={(e) => setShowWeather(e.currentTarget.checked)}
                        size="sm"
                      />
                    </Stack>
                  </Card>
                </Stack>
              </ScrollArea>
            </Tabs.Panel>
          </Tabs>

          {/* Footer Actions */}
          <div style={{ padding: '16px', borderTop: '1px solid #e9ecef' }}>
            <Stack gap="sm">
              <Group grow>
                <Tooltip label="Snap to roads (Ctrl+R)">
                  <Button
                    variant="default"
                    leftSection={<Navigation2 size={16} />}
                    onClick={snapToRoads}
                    disabled={waypoints.length < 2 || snapping}
                    loading={snapping}
                    size="sm"
                  >
                    Snap
                  </Button>
                </Tooltip>
                
                <Menu position="top-start">
                  <Menu.Target>
                    <Button
                      variant="default"
                      rightSection={<ChevronUp size={14} />}
                      size="sm"
                    >
                      Import/Export
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item
                      leftSection={<Download size={14} />}
                      onClick={exportGPX}
                      disabled={waypoints.length < 2}
                    >
                      Export GPX
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<Upload size={14} />}
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.gpx';
                        input.onchange = (e) => {
                          const file = e.target.files[0];
                          if (file) importGPX(file);
                        };
                        input.click();
                      }}
                    >
                      Import GPX
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
                
                <Tooltip label="Share route">
                  <Button
                    variant="default"
                    leftSection={<Share2 size={16} />}
                    onClick={shareRoute}
                    disabled={waypoints.length < 2}
                    size="sm"
                  >
                    Share
                  </Button>
                </Tooltip>
              </Group>
              
              <Button
                fullWidth
                leftSection={<Save size={16} />}
                onClick={saveRoute}
                disabled={!routeName || waypoints.length < 2 || saving}
                loading={saving}
                gradient={{ from: 'blue', to: 'cyan' }}
                variant="gradient"
              >
                Save Route
              </Button>
            </Stack>
          </div>
        </Paper>
      )}
    </Transition>
  );
};

export default RouteSidebar;