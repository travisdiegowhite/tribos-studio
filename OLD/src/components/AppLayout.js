import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppShell,
  Container,
  Group,
  Button,
  Text,
  Avatar,
  Menu,
  UnstyledButton,
  Burger,
  Flex,
  Badge,
  Collapse,
  Box,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Upload, User, LogOut, Route as RouteIcon, Brain, Plus, FileText, Scale, TrendingUp, Book, UserPlus, Home, GraduationCap, Users, MessageCircle, Calendar, BarChart3, History, ChevronDown, BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import UnitSettings from './UnitSettings';
import coachService from '../services/coachService';
import BetaFeedbackWidget from './BetaFeedbackWidget';

const AppLayout = ({ children, activePage, setActivePage, onShowOnboarding, userRideCount }) => {
  const { user, signOut, isDemoMode } = useAuth();
  const [opened, { toggle }] = useDisclosure();
  const navigate = useNavigate();
  const [totalUnreadMessages, setTotalUnreadMessages] = React.useState(0);

  // Collapsible section states
  const [planningOpen, setPlanningOpen] = React.useState(true);
  const [trainingOpen, setTrainingOpen] = React.useState(true);
  const [coachingOpen, setCoachingOpen] = React.useState(true);

  // Simplified navigation for new users
  // Shows full nav after: 7+ days, 5+ rides, or user toggles it
  const [showFullNav, setShowFullNav] = React.useState(() => {
    return localStorage.getItem('tribos_full_nav') === 'true';
  });

  // Check if user has no rides uploaded yet
  const hasNoRides = userRideCount === 0;

  // Determine if user should see simplified navigation
  // New users with few rides see simplified view unless they opt out
  const useSimplifiedNav = !showFullNav && userRideCount !== null && userRideCount < 5;

  const toggleFullNav = () => {
    const newValue = !showFullNav;
    setShowFullNav(newValue);
    localStorage.setItem('tribos_full_nav', newValue.toString());
  };

  // Fetch unread message count for athletes
  React.useEffect(() => {
    if (!user) return;

    const fetchUnreadCount = async () => {
      try {
        // Get all active coach relationships
        const { data: coaches } = await coachService.getCoaches(user.id, 'active');

        if (coaches && coaches.length > 0) {
          // Use optimized aggregate query instead of N individual queries
          const relationshipIds = coaches.map(rel => rel.id);
          const { data: counts } = await coachService.getAllUnreadCounts(user.id, relationshipIds);

          // Sum up all unread counts
          const totalUnread = Object.values(counts || {}).reduce((sum, count) => sum + count, 0);
          setTotalUnreadMessages(totalUnread);
        } else {
          setTotalUnreadMessages(0);
        }
      } catch (err) {
        console.error('Error fetching unread count:', err);
      }
    };

    fetchUnreadCount();

    // Refresh every 30 seconds
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [user]);
  
  const handleNavigation = (page, path) => {
    setActivePage(page);
    navigate(path);
    // Close mobile menu after navigation
    if (opened) {
      toggle();
    }
  };

  if (!user) {
    return (
      <Box style={{ width: '100%', minHeight: '100vh' }}>
        {children}
      </Box>
    );
  }

  return (
    <>
      <style>
        {`
          @keyframes pulse-glow {
            0%, 100% {
              box-shadow: 0 0 0 0 rgba(50, 205, 50, 0.4);
              transform: scale(1);
            }
            50% {
              box-shadow: 0 0 20px 5px rgba(50, 205, 50, 0.6);
              transform: scale(1.02);
            }
          }

          .import-button-pulse {
            animation: pulse-glow 2s ease-in-out infinite;
          }
        `}
      </style>
      <AppShell
        header={{ height: { base: 60, sm: 70 } }}
        navbar={{
          width: { base: 250, sm: 280 },
          breakpoint: 'md',
          collapsed: { mobile: !opened },
        }}
        padding={{ base: 'xs', sm: 'md' }}
      >
      <AppShell.Header>
        <Group h="100%" px={{ base: 'xs', sm: 'md' }} justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="md" size="sm" color="#32CD32" />
            <Group gap="xs" visibleFrom="xs">
              <RouteIcon size={28} color="#10b981" style={{ filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.4))' }} />
              <Text
                size={{ base: 'xl', sm: '2xl' }}
                fw={800}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #22d3ee 50%, #fbbf24 100%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  letterSpacing: '-0.05em',
                  textShadow: '0 0 30px rgba(16, 185, 129, 0.3)'
                }}
              >
                tribos.studio
              </Text>
            </Group>
          </Group>

          <Group gap={{ base: 'xs', sm: 'sm' }}>
            <UnitSettings />
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <UnstyledButton>
                  <Group gap="xs">
                    <Avatar size={{ base: 30, sm: 36 }} color={isDemoMode ? "teal" : "blue"}>
                      <User size={20} />
                    </Avatar>
                    <div style={{ flex: 1, display: { base: 'none', sm: 'block' } }}>
                      <Text size="sm" fw={500} visibleFrom="sm">
                        {isDemoMode ? 'Demo User' : user.email?.split('@')[0] || 'User'}
                      </Text>
                      <Text size="xs" c="dimmed" visibleFrom="sm">
                        {isDemoMode ? 'Exploring features' : user.email}
                      </Text>
                    </div>
                  </Group>
                </UnstyledButton>
              </Menu.Target>

              <Menu.Dropdown>
                {isDemoMode && (
                  <Menu.Item
                    leftSection={<UserPlus size={16} />}
                    onClick={signOut}
                    style={{
                      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(34, 211, 238, 0.1) 100%)',
                      fontWeight: 600,
                      color: '#10b981',
                    }}
                  >
                    Create Account
                  </Menu.Item>
                )}
                {onShowOnboarding && (
                  <Menu.Item
                    leftSection={<GraduationCap size={16} />}
                    onClick={() => {
                      onShowOnboarding();
                      if (opened) toggle(); // Close mobile menu if open
                    }}
                  >
                    View Tutorial
                  </Menu.Item>
                )}
                <Menu.Item leftSection={<LogOut size={16} />} onClick={signOut}>
                  {isDemoMode ? 'Exit Demo' : 'Sign out'}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Flex direction="column" gap="xs">
          {/* Dashboard */}
          <Button
            variant={activePage === 'dashboard' ? 'filled' : 'subtle'}
            leftSection={<Home size={18} />}
            onClick={() => handleNavigation('dashboard', '/')}
            justify="flex-start"
            fullWidth
          >
            Dashboard
          </Button>

          {/* Simplified Navigation for New Users */}
          {useSimplifiedNav ? (
            <>
              {/* Get a Route - Direct link to AI planner */}
              <Button
                variant={activePage === 'ai-routes' ? 'filled' : 'subtle'}
                leftSection={<Brain size={18} />}
                onClick={() => handleNavigation('ai-routes', '/ai-planner')}
                justify="flex-start"
                fullWidth
              >
                Get a Route
              </Button>

              {/* My Rides */}
              <Button
                variant={activePage === 'routes' ? 'filled' : 'subtle'}
                leftSection={<RouteIcon size={18} />}
                onClick={() => handleNavigation('routes', '/routes')}
                justify="flex-start"
                fullWidth
              >
                My Rides
              </Button>

              {/* Training - simplified link */}
              <Button
                variant={activePage === 'training' ? 'filled' : 'subtle'}
                leftSection={<TrendingUp size={18} />}
                onClick={() => handleNavigation('training', '/training')}
                justify="flex-start"
                fullWidth
              >
                Training
              </Button>

              {/* Import - with pulse animation for new users */}
              <Button
                variant={activePage === 'import' ? 'filled' : 'subtle'}
                leftSection={<Upload size={18} />}
                onClick={() => handleNavigation('import', '/import')}
                justify="flex-start"
                fullWidth
                className={hasNoRides ? 'import-button-pulse' : ''}
              >
                Import Rides
              </Button>
            </>
          ) : (
            <>
              {/* Full Navigation - Planning & Routes Section */}
              <Box>
                <UnstyledButton
                  onClick={() => setPlanningOpen(!planningOpen)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setPlanningOpen(!planningOpen);
                    }
                  }}
                  aria-expanded={planningOpen}
                  aria-controls="planning-items"
                  role="button"
                  tabIndex={0}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'background-color 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px rgba(16, 185, 129, 0.5)'}
                  onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                >
                  <Group gap="xs">
                    <Brain size={18} />
                    <Text size="sm" fw={500}>Planning & Routes</Text>
                  </Group>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    style={{
                      transform: planningOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  />
                </UnstyledButton>
                <Collapse in={planningOpen} id="planning-items">
                  <Flex direction="column" gap="xs" mt="xs" pl="md">
                    <Button
                      variant={activePage === 'ai-routes' ? 'filled' : 'subtle'}
                      leftSection={<Brain size={16} />}
                      onClick={() => handleNavigation('ai-routes', '/ai-planner')}
                      justify="flex-start"
                      fullWidth
                      size="sm"
                    >
                      Smart Route Planner
                    </Button>
                    <Button
                      variant={activePage === 'route-builder' ? 'filled' : 'subtle'}
                      leftSection={<Plus size={16} />}
                      onClick={() => handleNavigation('route-builder', '/route-builder')}
                      justify="flex-start"
                      fullWidth
                      size="sm"
                    >
                      Route Builder
                    </Button>
                    <Button
                      variant={activePage === 'routes' ? 'filled' : 'subtle'}
                      leftSection={<RouteIcon size={16} />}
                      onClick={() => handleNavigation('routes', '/routes')}
                      justify="flex-start"
                      fullWidth
                      size="sm"
                    >
                      My Routes
                    </Button>
                  </Flex>
                </Collapse>
              </Box>

              {/* Training Section */}
              <Box>
                <UnstyledButton
                  onClick={() => setTrainingOpen(!trainingOpen)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setTrainingOpen(!trainingOpen);
                    }
                  }}
                  aria-expanded={trainingOpen}
                  aria-controls="training-items"
                  role="button"
                  tabIndex={0}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'background-color 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px rgba(16, 185, 129, 0.5)'}
                  onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                >
                  <Group gap="xs">
                    <TrendingUp size={18} />
                    <Text size="sm" fw={500}>Training</Text>
                  </Group>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    style={{
                      transform: trainingOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  />
                </UnstyledButton>
                <Collapse in={trainingOpen} id="training-items">
                  <Flex direction="column" gap="xs" mt="xs" pl="md">
                    <Button
                      variant={activePage === 'training' ? 'filled' : 'subtle'}
                      leftSection={<TrendingUp size={16} />}
                      onClick={() => handleNavigation('training', '/training')}
                      justify="flex-start"
                      fullWidth
                      size="sm"
                    >
                      Training Dashboard
                    </Button>
                    <Button
                      variant={activePage === 'athlete-workouts' ? 'filled' : 'subtle'}
                      leftSection={<Calendar size={16} />}
                      onClick={() => handleNavigation('athlete-workouts', '/athlete/workouts')}
                      justify="flex-start"
                      fullWidth
                      size="sm"
                    >
                      My Workouts
                    </Button>
                    <Button
                      variant={activePage === 'workout-library' ? 'filled' : 'subtle'}
                      leftSection={<Book size={16} />}
                      onClick={() => handleNavigation('workout-library', '/workouts/library')}
                      justify="flex-start"
                      fullWidth
                      size="sm"
                    >
                      Workout Library
                    </Button>
                  </Flex>
                </Collapse>
              </Box>

              {/* Messages */}
              <Button
                variant={activePage === 'messages' ? 'filled' : 'subtle'}
                leftSection={<MessageCircle size={18} />}
                onClick={() => handleNavigation('messages', '/messages')}
                justify="flex-start"
                fullWidth
                rightSection={
                  totalUnreadMessages > 0 ? (
                    <Badge
                      size="sm"
                      variant="filled"
                      color="red"
                      circle
                      style={{
                        boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)',
                        animation: 'pulse 2s ease-in-out infinite'
                      }}
                    >
                      {totalUnreadMessages}
                    </Badge>
                  ) : null
                }
              >
                Messages
              </Button>

              {/* Coaching Section */}
              <Box>
                <UnstyledButton
                  onClick={() => setCoachingOpen(!coachingOpen)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setCoachingOpen(!coachingOpen);
                    }
                  }}
                  aria-expanded={coachingOpen}
                  aria-controls="coaching-items"
                  role="button"
                  tabIndex={0}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'background-color 0.2s, box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  onFocus={(e) => e.currentTarget.style.boxShadow = '0 0 0 2px rgba(16, 185, 129, 0.5)'}
                  onBlur={(e) => e.currentTarget.style.boxShadow = 'none'}
                >
                  <Group gap="xs">
                    <Users size={18} />
                    <Text size="sm" fw={500}>Coaching</Text>
                  </Group>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    style={{
                      transform: coachingOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                  />
                </UnstyledButton>
                <Collapse in={coachingOpen} id="coaching-items">
                  <Flex direction="column" gap="xs" mt="xs" pl="md">
                    <Button
                      variant={activePage === 'coach' ? 'filled' : 'subtle'}
                      leftSection={<Users size={16} />}
                      onClick={() => handleNavigation('coach', '/coach')}
                      justify="flex-start"
                      fullWidth
                      size="sm"
                    >
                      Coach Dashboard
                    </Button>
                    <Button
                      variant={activePage === 'coach-insights' ? 'filled' : 'subtle'}
                      leftSection={<BarChart3 size={16} />}
                      onClick={() => handleNavigation('coach-insights', '/coach/insights')}
                      justify="flex-start"
                      fullWidth
                      size="sm"
                    >
                      Insights
                    </Button>
                  </Flex>
                </Collapse>
              </Box>

              {/* My History */}
              <Button
                variant={activePage === 'athlete-history' ? 'filled' : 'subtle'}
                leftSection={<History size={18} />}
                onClick={() => handleNavigation('athlete-history', '/athlete/history')}
                justify="flex-start"
                fullWidth
              >
                My History
              </Button>

              {/* Import */}
              <Button
                variant={activePage === 'import' ? 'filled' : 'subtle'}
                leftSection={<Upload size={18} />}
                onClick={() => handleNavigation('import', '/import')}
                justify="flex-start"
                fullWidth
                className={hasNoRides ? 'import-button-pulse' : ''}
              >
                Import
              </Button>
            </>
          )}
        </Flex>

        <Container mt="auto" p={0}>
          {/* Toggle for simplified/full navigation */}
          {useSimplifiedNav && (
            <Button
              variant="subtle"
              size="xs"
              onClick={toggleFullNav}
              justify="center"
              fullWidth
              mb="sm"
              c="dimmed"
              style={{
                borderTop: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 0,
                paddingTop: 12,
              }}
            >
              Show all features
            </Button>
          )}
          {showFullNav && userRideCount !== null && userRideCount < 5 && (
            <Button
              variant="subtle"
              size="xs"
              onClick={toggleFullNav}
              justify="center"
              fullWidth
              mb="sm"
              c="dimmed"
              style={{
                borderTop: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 0,
                paddingTop: 12,
              }}
            >
              Simplify menu
            </Button>
          )}
          <Flex direction="column" gap="xs" mb="sm">
            <Button
              variant="subtle"
              size="xs"
              leftSection={<FileText size={14} />}
              onClick={() => window.open('/privacy-policy', '_blank')}
              justify="flex-start"
              fullWidth
              c="dimmed"
            >
              Privacy Policy
            </Button>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<Scale size={14} />}
              onClick={() => window.open('/terms-of-service', '_blank')}
              justify="flex-start"
              fullWidth
              c="dimmed"
            >
              Terms of Service
            </Button>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<BookOpen size={14} />}
              onClick={() => window.open('/training-research', '_blank')}
              justify="flex-start"
              fullWidth
              c="dimmed"
            >
              Training Research
            </Button>
          </Flex>
          <Text size="xs" c="dimmed" ta="center" mb="xs">
            tribos.studio
          </Text>
          <Text size="xs" c="dimmed" ta="center">
            Intelligent cycling route planning
          </Text>
        </Container>
      </AppShell.Navbar>

      <AppShell.Main>
        {children}
      </AppShell.Main>
    </AppShell>

    {/* Beta Feedback Widget - Only show for authenticated users */}
    {user && !isDemoMode && <BetaFeedbackWidget />}
    </>
  );
};

export default AppLayout;
