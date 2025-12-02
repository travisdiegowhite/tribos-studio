import React, { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Accordion,
  Card,
  Group,
  Stack,
  Badge,
  Button,
  TextInput,
  Tabs,
  Paper,
  List,
  ThemeIcon,
} from '@mantine/core';
import {
  HelpCircle,
  Map,
  Brain,
  Plus,
  Zap,
  Upload,
  Activity,
  TrendingUp,
  Search,
  Video,
  BookOpen,
  MessageCircle,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';

const HelpCenter = () => {
  const [searchQuery, setSearchQuery] = useState('');

  const quickStartGuides = [
    {
      icon: Brain,
      title: 'Generate Your First Smart Route',
      description: 'Learn how to create personalized cycling routes',
      time: '2 min',
      steps: [
        'Click on "Smart Route Planner" in the menu',
        'Set your start location by clicking on the map or using your current location',
        'Choose your available time and training goal',
        'Click "Find My Routes" and explore the options',
      ],
    },
    {
      icon: Plus,
      title: 'Build a Custom Route',
      description: 'Create routes manually by clicking on the map',
      time: '3 min',
      steps: [
        'Navigate to "Route Builder" from the menu',
        'Click on the map to add waypoints',
        'The route will automatically connect your points',
        'View elevation profile and stats in the sidebar',
        'Save your route when finished',
      ],
    },
    {
      icon: Upload,
      title: 'Import Your Rides',
      description: 'Upload GPX or FIT files from your bike computer',
      time: '2 min',
      steps: [
        'Go to "Upload Routes" from the menu',
        'Drag and drop your GPX or FIT file',
        'View your route on the map with elevation data',
        'Save to your library for future reference',
      ],
    },
  ];

  const faqItems = [
    {
      category: 'Getting Started',
      icon: BookOpen,
      questions: [
        {
          q: 'What is tribos.studio?',
          a: 'tribos.studio is an intelligent cycling route planning platform that helps you generate personalized routes, analyze your performance, and discover new cycling adventures. It uses advanced algorithms to understand your preferences and create optimal routes for your training goals.',
        },
        {
          q: 'How do I create my first route?',
          a: 'You have three options: 1) Use the Smart Route Planner to automatically create routes based on your preferences, 2) Use Route Builder to manually create routes by clicking on the map, or 3) Upload existing routes from GPX or FIT files.',
        },
        {
          q: 'Is tribos.studio free to use?',
          a: 'Yes! tribos.studio is currently free to use. We may introduce premium features in the future, but core functionality will always remain free.',
        },
      ],
    },
    {
      category: 'Smart Route Planner',
      icon: Brain,
      questions: [
        {
          q: 'How does the Smart Route Planner work?',
          a: 'Our system analyzes your preferences, past rides, current weather conditions, and training goals to generate optimal cycling routes. It considers factors like elevation, road types, traffic patterns, and scenic value to create personalized routes just for you.',
        },
        {
          q: 'What training goals can I choose?',
          a: 'You can select from Recovery (easy, flat routes), Endurance (steady, longer routes), Intervals (routes with varying intensity), or Hills (challenging climbs). The system adjusts route characteristics based on your selection.',
        },
        {
          q: 'Can I save generated routes?',
          a: 'Yes! Once you generate routes, you can save any of them to your library for future reference. You can also download them as GPX files to use with your bike computer or GPS device.',
        },
        {
          q: 'Why are my routes different each time?',
          a: 'The system generates unique routes each time to provide variety and help you discover new roads. It considers real-time factors like weather and learns from your feedback to improve suggestions over time.',
        },
      ],
    },
    {
      category: 'Route Builder',
      icon: Plus,
      questions: [
        {
          q: 'How do I add waypoints to my route?',
          a: 'Simply click on the map where you want to add points. The route will automatically connect them using cycling-friendly roads. You can add as many waypoints as you need to create your desired route.',
        },
        {
          q: 'Can I edit existing routes?',
          a: 'Yes! In Route Studio, you can modify saved routes by adding, removing, or moving waypoints. The route will automatically recalculate to maintain the best cycling path.',
        },
        {
          q: 'What do the elevation colors mean?',
          a: 'The elevation profile uses color coding: Green (easy, 0-3% gradient), Yellow (moderate, 3-6%), Orange (hard, 6-10%), and Red (very hard, 10%+). This helps you understand the difficulty of different sections.',
        },
      ],
    },
    {
      category: 'Route Studio',
      icon: Zap,
      questions: [
        {
          q: 'What is Route Studio?',
          a: 'Route Studio is an advanced editing environment where you can fine-tune routes with professional-grade tools. It includes elevation analysis, gradient visualization, route optimization, and smart routing features designed for serious cyclists.',
        },
        {
          q: 'What is the gravel profile feature?',
          a: 'The gravel profile option routes you along unpaved roads and trails suitable for gravel bikes. It prioritizes scenic off-road paths while ensuring surfaces are rideable on appropriate bikes.',
        },
        {
          q: 'How does smart routing work?',
          a: 'Smart routing automatically finds the best cycling path between your waypoints, considering factors like bike lanes, low-traffic roads, scenic routes, and appropriate surfaces for your bike type.',
        },
      ],
    },
    {
      category: 'File Uploads & Integrations',
      icon: Upload,
      questions: [
        {
          q: 'What file formats are supported?',
          a: 'We support GPX (GPS Exchange Format) and FIT (Flexible and Interoperable Data Transfer) files. These are the standard formats used by most bike computers, GPS devices, and cycling apps.',
        },
        {
          q: 'How do I import from Strava or other apps?',
          a: 'Go to "Import from Fitness Apps" in the menu and connect your account. You can import activities from Strava, Wahoo, Garmin, and other popular cycling platforms. Your data is stored securely and never shared.',
        },
        {
          q: 'Can I export routes to my bike computer?',
          a: 'Yes! All routes can be downloaded as GPX files, which are compatible with Garmin, Wahoo, Hammerhead, and virtually all other GPS-enabled bike computers.',
        },
      ],
    },
    {
      category: 'Training Dashboard',
      icon: TrendingUp,
      questions: [
        {
          q: 'What is the Training Dashboard?',
          a: 'The Training Dashboard is a comprehensive training hub that combines intelligent ride analysis, performance analytics, and personalized training plans. It tracks your progress, analyzes your rides, and provides insights about your performance, effort distribution, pacing, and areas for improvement.',
        },
        {
          q: 'What metrics does it analyze?',
          a: 'We analyze speed, elevation gain, power output (if available), heart rate zones, pacing consistency, effort distribution, training load (CTL/ATL/TSB), and weekly/monthly trends. The system provides context-aware insights specific to your training goals.',
        },
        {
          q: 'How do I create a training plan?',
          a: 'Go to Training Dashboard and click "Create New Plan". Choose your goal (race, event, or fitness), set your target date, and specify your current fitness level. The system will generate a personalized training plan with progressive workouts.',
        },
        {
          q: 'Can I modify training plans?',
          a: 'Yes! Training plans are fully customizable. You can adjust individual workouts, move rest days, change intensity levels, and adapt the plan as your fitness improves or circumstances change.',
        },
        {
          q: 'How do I view trends over different time periods?',
          a: 'The Trends tab in the Training Dashboard lets you filter data by All Time, Last 12 Months, or Last 18 Months. This helps you analyze recent performance trends versus your overall riding history.',
        },
      ],
    },
    {
      category: 'Privacy & Security',
      icon: HelpCircle,
      questions: [
        {
          q: 'Is my data private?',
          a: 'Absolutely! All your routes, rides, and personal data are private by default. You control what you share. We use enterprise-grade security with encryption and never sell your data.',
        },
        {
          q: 'How do you store my fitness app tokens?',
          a: 'All OAuth tokens (Strava, Wahoo, Garmin) are stored securely on our servers with encryption. They are never exposed to your browser or any third parties. We follow industry best practices for sensitive data storage.',
        },
        {
          q: 'Can I delete my data?',
          a: 'Yes, you can delete your account and all associated data at any time. Go to Settings → Account → Delete Account. All your data will be permanently removed from our servers.',
        },
      ],
    },
  ];

  const videoTutorials = [
    {
      title: 'Getting Started with tribos.studio',
      duration: '3:45',
      thumbnail: 'intro',
      description: 'Learn the basics and generate your first route',
    },
    {
      title: 'Advanced Route Studio Features',
      duration: '5:20',
      thumbnail: 'studio',
      description: 'Master professional route editing tools',
    },
    {
      title: 'Analyzing Your Performance',
      duration: '4:10',
      thumbnail: 'analysis',
      description: 'Get intelligent insights from your ride data',
    },
  ];

  const filteredFAQs = faqItems.map(category => ({
    ...category,
    questions: category.questions.filter(
      item =>
        item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.a.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(category => category.questions.length > 0);

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <div>
          <Group gap="xs" mb="xs">
            <HelpCircle size={32} color="#10b981" />
            <Title order={1}>Help Center</Title>
          </Group>
          <Text size="lg" c="dimmed">
            Everything you need to know about tribos.studio
          </Text>
        </div>

        {/* Search */}
        <TextInput
          placeholder="Search for help..."
          size="lg"
          leftSection={<Search size={20} />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          radius="md"
        />

        <Tabs defaultValue="quick-start" variant="pills">
          <Tabs.List>
            <Tabs.Tab value="quick-start" leftSection={<ArrowRight size={16} />}>
              Quick Start
            </Tabs.Tab>
            <Tabs.Tab value="faq" leftSection={<HelpCircle size={16} />}>
              FAQ
            </Tabs.Tab>
            <Tabs.Tab value="videos" leftSection={<Video size={16} />}>
              Video Tutorials
            </Tabs.Tab>
            <Tabs.Tab value="contact" leftSection={<MessageCircle size={16} />}>
              Contact Support
            </Tabs.Tab>
          </Tabs.List>

          {/* Quick Start Guides */}
          <Tabs.Panel value="quick-start" pt="xl">
            <Stack gap="md">
              <Title order={2}>Quick Start Guides</Title>
              <Text c="dimmed" mb="md">
                Follow these step-by-step guides to get started with tribos.studio
              </Text>

              {quickStartGuides.map((guide, index) => {
                const Icon = guide.icon;
                return (
                  <Card key={index} shadow="sm" padding="lg" radius="md" withBorder>
                    <Group justify="space-between" mb="md">
                      <Group>
                        <ThemeIcon size={48} radius="md" variant="light" color="teal">
                          <Icon size={24} />
                        </ThemeIcon>
                        <div>
                          <Title order={3}>{guide.title}</Title>
                          <Text size="sm" c="dimmed">{guide.description}</Text>
                        </div>
                      </Group>
                      <Badge color="teal" variant="light">{guide.time}</Badge>
                    </Group>

                    <List
                      spacing="sm"
                      size="sm"
                      center
                      icon={
                        <ThemeIcon color="teal" size={20} radius="xl">
                          <CheckCircle size={14} />
                        </ThemeIcon>
                      }
                    >
                      {guide.steps.map((step, idx) => (
                        <List.Item key={idx}>{step}</List.Item>
                      ))}
                    </List>
                  </Card>
                );
              })}
            </Stack>
          </Tabs.Panel>

          {/* FAQ */}
          <Tabs.Panel value="faq" pt="xl">
            <Stack gap="md">
              <Title order={2}>Frequently Asked Questions</Title>

              {(searchQuery ? filteredFAQs : faqItems).map((category, catIndex) => {
                const Icon = category.icon;
                return (
                  <div key={catIndex}>
                    <Group gap="xs" mb="md">
                      <Icon size={24} color="#10b981" />
                      <Title order={3}>{category.category}</Title>
                    </Group>

                    <Accordion variant="separated" radius="md">
                      {category.questions.map((item, qIndex) => (
                        <Accordion.Item key={qIndex} value={`${catIndex}-${qIndex}`}>
                          <Accordion.Control>
                            <Text fw={500}>{item.q}</Text>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Text>{item.a}</Text>
                          </Accordion.Panel>
                        </Accordion.Item>
                      ))}
                    </Accordion>
                  </div>
                );
              })}

              {searchQuery && filteredFAQs.length === 0 && (
                <Paper p="xl" radius="md" withBorder ta="center">
                  <Text size="lg" c="dimmed">
                    No results found for "{searchQuery}"
                  </Text>
                  <Text size="sm" c="dimmed" mt="xs">
                    Try different keywords or contact support below
                  </Text>
                </Paper>
              )}
            </Stack>
          </Tabs.Panel>

          {/* Video Tutorials */}
          <Tabs.Panel value="videos" pt="xl">
            <Stack gap="md">
              <Title order={2}>Video Tutorials</Title>
              <Text c="dimmed" mb="md">
                Watch these videos to learn tribos.studio features visually
              </Text>

              <Text c="dimmed" ta="center" py="xl">
                <Video size={48} style={{ margin: '0 auto 16px' }} />
                <Text size="lg" fw={500}>Video tutorials coming soon!</Text>
                <Text size="sm" mt="xs">
                  We're creating comprehensive video guides to help you master tribos.studio.
                  Check back soon for step-by-step video tutorials.
                </Text>
              </Text>
            </Stack>
          </Tabs.Panel>

          {/* Contact Support */}
          <Tabs.Panel value="contact" pt="xl">
            <Stack gap="md">
              <Title order={2}>Contact Support</Title>
              <Text c="dimmed" mb="md">
                Can't find what you're looking for? We're here to help!
              </Text>

              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Stack gap="md">
                  <Group>
                    <ThemeIcon size={48} radius="md" variant="light" color="teal">
                      <MessageCircle size={24} />
                    </ThemeIcon>
                    <div>
                      <Title order={3}>Get in Touch</Title>
                      <Text size="sm" c="dimmed">We typically respond within 24 hours</Text>
                    </div>
                  </Group>

                  <List spacing="sm">
                    <List.Item>
                      <Text>
                        <strong>Email:</strong>{' '}
                        <a href="mailto:support@tribos.studio" style={{ color: '#10b981' }}>
                          support@tribos.studio
                        </a>
                      </Text>
                    </List.Item>
                    <List.Item>
                      <Text>
                        <strong>Response Time:</strong> Usually within 24 hours
                      </Text>
                    </List.Item>
                    <List.Item>
                      <Text>
                        <strong>Support Hours:</strong> Monday - Friday, 9am - 5pm PST
                      </Text>
                    </List.Item>
                  </List>

                  <Button
                    component="a"
                    href="mailto:support@tribos.studio?subject=tribos.studio Support Request"
                    leftSection={<MessageCircle size={18} />}
                    size="lg"
                    color="teal"
                  >
                    Send Support Email
                  </Button>
                </Stack>
              </Card>

              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Stack gap="md">
                  <Title order={4}>Before contacting support, please:</Title>
                  <List spacing="xs">
                    <List.Item>Check the FAQ section above for common questions</List.Item>
                    <List.Item>Try clearing your browser cache and cookies</List.Item>
                    <List.Item>Ensure you're using a supported browser (Chrome, Firefox, Safari, or Edge)</List.Item>
                    <List.Item>Include details about your issue: what you were doing, error messages, and screenshots if possible</List.Item>
                  </List>
                </Stack>
              </Card>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
};

export default HelpCenter;
