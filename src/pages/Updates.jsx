import {
  Container,
  Title,
  Text,
  Card,
  Stack,
  Group,
  Badge,
  Box,
  SimpleGrid,
  ThemeIcon,
  Divider,
  Paper,
} from '@mantine/core';
import {
  IconSparkles,
  IconCalendarEvent,
  IconChartBar,
  IconRobot,
  IconRoute,
  IconRocket,
  IconBulb,
  IconArrowRight,
} from '@tabler/icons-react';
import { tokens } from '../theme';
import AppShell from '../components/AppShell.jsx';
import updatesData from '../data/updates.json';

// Map icon names to components
const iconMap = {
  'calendar-chart': IconCalendarEvent,
  'robot': IconRobot,
  'route': IconRoute,
  'improvement': IconRocket,
};

function FeatureCard({ name, description, highlight }) {
  return (
    <Card
      p="lg"
      radius="md"
      style={{
        background: tokens.colors.bgSecondary,
        border: `1px solid ${tokens.colors.bgTertiary}`,
      }}
    >
      <Stack gap="sm">
        <Text fw={600} size="lg" c={tokens.colors.textPrimary}>
          {name}
        </Text>
        <Text size="sm" c={tokens.colors.textSecondary} lh={1.6}>
          {description}
        </Text>
        {highlight && (
          <Badge
            variant="light"
            color="lime"
            size="sm"
            style={{ alignSelf: 'flex-start' }}
          >
            {highlight}
          </Badge>
        )}
      </Stack>
    </Card>
  );
}

function FeatureSection({ feature }) {
  const IconComponent = iconMap[feature.icon] || IconSparkles;

  return (
    <Box mb="xl">
      <Group gap="sm" mb="md">
        <ThemeIcon
          size="lg"
          radius="md"
          variant="light"
          color="lime"
        >
          <IconComponent size={20} />
        </ThemeIcon>
        <Box>
          <Text size="xs" c={tokens.colors.textMuted} tt="uppercase" fw={500}>
            {feature.category}
          </Text>
          <Title order={3} c={tokens.colors.textPrimary}>
            {feature.title}
          </Title>
        </Box>
      </Group>

      {feature.description && (
        <Text size="sm" c={tokens.colors.textSecondary} mb="md" lh={1.6}>
          {feature.description}
        </Text>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, md: feature.items.length > 2 ? 3 : 2 }} spacing="md">
        {feature.items.map((item, idx) => (
          <FeatureCard key={idx} {...item} />
        ))}
      </SimpleGrid>

      {feature.summary && (
        <Paper
          p="md"
          mt="md"
          radius="md"
          style={{
            background: `linear-gradient(135deg, ${tokens.colors.electricLime}15, ${tokens.colors.electricLime}05)`,
            border: `1px solid ${tokens.colors.electricLime}30`,
          }}
        >
          <Group gap="xs">
            <IconBulb size={16} color={tokens.colors.electricLime} />
            <Text size="sm" c={tokens.colors.textPrimary} fw={500}>
              {feature.summary}
            </Text>
          </Group>
        </Paper>
      )}
    </Box>
  );
}

function UpdateCard({ update }) {
  return (
    <Card
      p="lg"
      radius="md"
      style={{
        background: tokens.colors.bgSecondary,
        border: `1px solid ${tokens.colors.bgTertiary}`,
      }}
    >
      <Group justify="space-between" mb="sm">
        <Badge variant="light" color="lime" size="sm">
          {update.type === 'improvement' ? 'Improvement' : 'New'}
        </Badge>
        <Text size="xs" c={tokens.colors.textMuted}>
          {update.date}
        </Text>
      </Group>

      <Text fw={600} size="lg" c={tokens.colors.textPrimary} mb="xs">
        {update.title}
      </Text>

      <Text size="sm" c={tokens.colors.textSecondary} mb="md" lh={1.6}>
        {update.description}
      </Text>

      {update.details && (
        <Stack gap={6}>
          {update.details.map((detail, idx) => (
            <Group key={idx} gap="xs" wrap="nowrap">
              <IconArrowRight size={14} color={tokens.colors.electricLime} style={{ flexShrink: 0 }} />
              <Text size="sm" c={tokens.colors.textSecondary}>
                {detail}
              </Text>
            </Group>
          ))}
        </Stack>
      )}
    </Card>
  );
}

function Updates() {
  const { welcome, features, updates, comingSoon } = updatesData;

  return (
    <AppShell>
      <Container size="lg" py="xl">
        <Stack gap="xl">
          {/* Welcome Section */}
          <Box mb="md">
            <Group gap="sm" mb="xs">
              <IconSparkles size={28} color={tokens.colors.electricLime} />
              <Title order={1} c={tokens.colors.textPrimary}>
                {welcome.title}
              </Title>
            </Group>
            <Text size="lg" c={tokens.colors.electricLime} fw={500} mb="sm">
              {welcome.subtitle}
            </Text>
            <Text size="md" c={tokens.colors.textSecondary} lh={1.7} maw={700}>
              {welcome.description}
            </Text>
          </Box>

          <Divider color={tokens.colors.bgTertiary} />

          {/* Feature Sections */}
          {features.map((feature) => (
            <FeatureSection key={feature.id} feature={feature} />
          ))}

          <Divider color={tokens.colors.bgTertiary} />

          {/* Recent Updates */}
          <Box>
            <Group gap="sm" mb="lg">
              <ThemeIcon size="lg" radius="md" variant="light" color="lime">
                <IconRocket size={20} />
              </ThemeIcon>
              <Title order={2} c={tokens.colors.textPrimary}>
                Recent Updates
              </Title>
            </Group>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              {updates.map((update) => (
                <UpdateCard key={update.id} update={update} />
              ))}
            </SimpleGrid>
          </Box>

          {/* Coming Soon */}
          {comingSoon && comingSoon.length > 0 && (
            <Box>
              <Text size="sm" c={tokens.colors.textMuted} tt="uppercase" fw={500} mb="md">
                Coming Soon
              </Text>
              <Group gap="md">
                {comingSoon.map((item, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    color="gray"
                    size="lg"
                    radius="md"
                    style={{ padding: '12px 16px' }}
                  >
                    {item.title}
                  </Badge>
                ))}
              </Group>
            </Box>
          )}
        </Stack>
      </Container>
    </AppShell>
  );
}

export default Updates;
