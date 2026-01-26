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
        background: 'var(--tribos-bg-secondary)',
        border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
      }}
    >
      <Stack gap="sm">
        <Text fw={600} size="lg" c={'var(--tribos-text-primary)'}>
          {name}
        </Text>
        <Text size="sm" c={'var(--tribos-text-secondary)'} lh={1.6}>
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
          <Text size="xs" c={'var(--tribos-text-muted)'} tt="uppercase" fw={500}>
            {feature.category}
          </Text>
          <Title order={3} c={'var(--tribos-text-primary)'}>
            {feature.title}
          </Title>
        </Box>
      </Group>

      {feature.description && (
        <Text size="sm" c={'var(--tribos-text-secondary)'} mb="md" lh={1.6}>
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
            background: `linear-gradient(135deg, ${'var(--tribos-lime)'}15, ${'var(--tribos-lime)'}05)`,
            border: `1px solid ${'var(--tribos-lime)'}30`,
          }}
        >
          <Group gap="xs">
            <IconBulb size={16} color={'var(--tribos-lime)'} />
            <Text size="sm" c={'var(--tribos-text-primary)'} fw={500}>
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
        background: 'var(--tribos-bg-secondary)',
        border: `1px solid ${'var(--tribos-bg-tertiary)'}`,
      }}
    >
      <Group justify="space-between" mb="sm">
        <Badge variant="light" color="lime" size="sm">
          {update.type === 'improvement' ? 'Improvement' : 'New'}
        </Badge>
        <Text size="xs" c={'var(--tribos-text-muted)'}>
          {update.date}
        </Text>
      </Group>

      <Text fw={600} size="lg" c={'var(--tribos-text-primary)'} mb="xs">
        {update.title}
      </Text>

      <Text size="sm" c={'var(--tribos-text-secondary)'} mb="md" lh={1.6}>
        {update.description}
      </Text>

      {update.details && (
        <Stack gap={6}>
          {update.details.map((detail, idx) => (
            <Group key={idx} gap="xs" wrap="nowrap">
              <IconArrowRight size={14} color={'var(--tribos-lime)'} style={{ flexShrink: 0 }} />
              <Text size="sm" c={'var(--tribos-text-secondary)'}>
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
              <IconSparkles size={28} color={'var(--tribos-lime)'} />
              <Title order={1} c={'var(--tribos-text-primary)'}>
                {welcome.title}
              </Title>
            </Group>
            <Text size="lg" c={'var(--tribos-lime)'} fw={500} mb="sm">
              {welcome.subtitle}
            </Text>
            <Text size="md" c={'var(--tribos-text-secondary)'} lh={1.7} maw={700}>
              {welcome.description}
            </Text>
          </Box>

          <Divider color={'var(--tribos-bg-tertiary)'} />

          {/* Feature Sections */}
          {features.map((feature) => (
            <FeatureSection key={feature.id} feature={feature} />
          ))}

          <Divider color={'var(--tribos-bg-tertiary)'} />

          {/* Recent Updates */}
          <Box>
            <Group gap="sm" mb="lg">
              <ThemeIcon size="lg" radius="md" variant="light" color="lime">
                <IconRocket size={20} />
              </ThemeIcon>
              <Title order={2} c={'var(--tribos-text-primary)'}>
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
              <Text size="sm" c={'var(--tribos-text-muted)'} tt="uppercase" fw={500} mb="md">
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
