import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Paper, Stack, Title, Text, Button, Group, TextInput } from '@mantine/core';
import { tokens } from '../theme';
import AppShell from '../components/AppShell';

function RouteBuilder() {
  const { routeId } = useParams();
  const [routeName, setRouteName] = useState('Untitled Route');
  const isEditing = !!routeId;

  return (
    <AppShell fullWidth>
      <Box style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
        {/* Sidebar */}
        <Paper
          style={{
            width: 360,
            backgroundColor: tokens.colors.bgSecondary,
            borderRight: `1px solid ${tokens.colors.bgTertiary}`,
            display: 'flex',
            flexDirection: 'column',
          }}
          radius={0}
          p="md"
        >
          <Stack gap="md" style={{ flex: 1 }}>
            <Box>
              <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="xs">
                ROUTE NAME
              </Text>
              <TextInput
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                variant="filled"
                size="md"
              />
            </Box>

            {/* Route Stats */}
            <Box
              style={{
                padding: tokens.spacing.md,
                backgroundColor: tokens.colors.bgTertiary,
                borderRadius: tokens.radius.md,
              }}
            >
              <Group justify="space-between" mb="xs">
                <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                  Distance
                </Text>
                <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                  0.0 km
                </Text>
              </Group>
              <Group justify="space-between" mb="xs">
                <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                  Elevation
                </Text>
                <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                  0 m
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" style={{ color: tokens.colors.textSecondary }}>
                  Est. Time
                </Text>
                <Text fw={600} style={{ color: tokens.colors.textPrimary }}>
                  --:--
                </Text>
              </Group>
            </Box>

            {/* Instructions */}
            <Box style={{ flex: 1 }}>
              <Text size="xs" style={{ color: tokens.colors.textMuted }} mb="sm">
                DIRECTIONS
              </Text>
              <Box
                style={{
                  padding: tokens.spacing.lg,
                  textAlign: 'center',
                  borderRadius: tokens.radius.md,
                  border: `1px dashed ${tokens.colors.bgTertiary}`,
                }}
              >
                <Text style={{ color: tokens.colors.textSecondary }} size="sm">
                  Click on the map to add waypoints and create your route.
                </Text>
              </Box>
            </Box>

            {/* Actions */}
            <Stack gap="sm">
              <Button color="lime" fullWidth>
                Save Route
              </Button>
              <Button variant="outline" color="gray" fullWidth>
                Export GPX
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {/* Map Container */}
        <Box
          style={{
            flex: 1,
            backgroundColor: tokens.colors.bgPrimary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Stack align="center" gap="md">
            <Text size="4rem">🗺️</Text>
            <Title order={2} style={{ color: tokens.colors.textPrimary }}>
              Map View
            </Title>
            <Text style={{ color: tokens.colors.textSecondary, maxWidth: 400, textAlign: 'center' }}>
              Mapbox GL map will be rendered here. Configure your VITE_MAPBOX_TOKEN in .env to enable the map.
            </Text>
          </Stack>
        </Box>
      </Box>
    </AppShell>
  );
}

export default RouteBuilder;
