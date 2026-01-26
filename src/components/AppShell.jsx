import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Group,
  Text,
  UnstyledButton,
  Container,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useMantineColorScheme } from '@mantine/core';
import {
  IconHome,
  IconMap,
  IconActivity,
  IconUsers,
  IconSettings,
  IconSun,
  IconMoon,
} from '@tabler/icons-react';
import BetaFeedbackWidget from './BetaFeedbackWidget.jsx';

// Flat navigation - 5 direct links, no dropdowns
const navItems = [
  { path: '/dashboard', label: 'Home', icon: IconHome },
  { path: '/routes/list', label: 'Routes', icon: IconMap },
  { path: '/training', label: 'Training', icon: IconActivity },
  { path: '/community', label: 'Cafe', icon: IconUsers },
  { path: '/settings', label: 'Settings', icon: IconSettings },
];

function AppShell({ children, fullWidth = false, hideNav = false }) {
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  // Check if current path matches nav item
  const isActive = (item) => {
    // Special handling for routes - match both /routes/list and /routes/new
    if (item.path === '/routes/list') {
      return location.pathname.startsWith('/routes');
    }
    // Special handling for training - match /training and /planner
    if (item.path === '/training') {
      return location.pathname.startsWith('/training') || location.pathname.startsWith('/planner');
    }
    return location.pathname === item.path || location.pathname.startsWith(item.path + '/');
  };

  return (
    <Box
      style={{
        minHeight: '100dvh',
        backgroundColor: 'var(--tribos-bg-primary)',
        paddingBottom: isMobile && !hideNav ? 64 : 0,
      }}
    >
      {/* Header - Clean, Linear-inspired */}
      <Box
        component="header"
        style={{
          height: 56,
          backgroundColor: 'var(--tribos-bg-primary)',
          borderBottom: '1px solid var(--tribos-border)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <Container size={fullWidth ? '100%' : 'xl'} h="100%" px={fullWidth ? 'md' : undefined}>
          <Group h="100%" justify="space-between">
            {/* Logo */}
            <Link to="/dashboard" style={{ textDecoration: 'none' }}>
              <Text
                fw={700}
                size="md"
                style={{
                  color: 'var(--tribos-text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                TRIBOS
              </Text>
            </Link>

            {/* Desktop Navigation */}
            {!isMobile && (
              <Group gap={4}>
                {navItems.map((item) => (
                  <DesktopNavLink
                    key={item.path}
                    to={item.path}
                    label={item.label}
                    icon={item.icon}
                    active={isActive(item)}
                  />
                ))}
                <Tooltip label={colorScheme === 'dark' ? 'Light mode' : 'Dark mode'}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={toggleColorScheme}
                    ml="xs"
                  >
                    {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
                  </ActionIcon>
                </Tooltip>
                <Box ml="xs">
                  <BetaFeedbackWidget />
                </Box>
              </Group>
            )}

            {/* Mobile: Theme toggle and Feedback button in header */}
            {isMobile && (
              <Group gap="xs">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={toggleColorScheme}
                >
                  {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
                </ActionIcon>
                <BetaFeedbackWidget />
              </Group>
            )}
          </Group>
        </Container>
      </Box>

      {/* Main content */}
      <Box component="main">{children}</Box>

      {/* Mobile Bottom Tab Bar - 5 items, flat navigation */}
      {isMobile && !hideNav && (
        <MobileBottomNav navItems={navItems} isActive={isActive} />
      )}
    </Box>
  );
}

// Desktop nav link - simple, clean
function DesktopNavLink({ to, label, icon: Icon, active }) {
  return (
    <UnstyledButton
      component={Link}
      to={to}
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        backgroundColor: active ? 'var(--tribos-bg-tertiary)' : 'transparent',
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = 'var(--tribos-bg-secondary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      <Group gap={6}>
        <Icon
          size={16}
          color={active ? 'var(--tribos-lime)' : 'var(--tribos-text-secondary)'}
          stroke={1.5}
        />
        <Text
          size="sm"
          fw={active ? 500 : 400}
          style={{
            color: active ? 'var(--tribos-text-primary)' : 'var(--tribos-text-secondary)',
          }}
        >
          {label}
        </Text>
      </Group>
    </UnstyledButton>
  );
}

// Mobile bottom nav - 5 items, direct links
function MobileBottomNav({ navItems, isActive }) {
  const navigate = useNavigate();

  return (
    <Box
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        backgroundColor: 'var(--tribos-bg-secondary)',
        borderTop: '1px solid var(--tribos-border)',
        zIndex: 100,
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item);

        return (
          <UnstyledButton
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 12px',
              flex: 1,
              gap: 2,
              minHeight: 44, // Touch target
            }}
          >
            <Icon
              size={22}
              color={active ? 'var(--tribos-lime)' : 'var(--tribos-text-secondary)'}
              stroke={active ? 2 : 1.5}
            />
            <Text
              size="xs"
              fw={active ? 500 : 400}
              style={{
                color: active ? 'var(--tribos-lime)' : 'var(--tribos-text-secondary)',
                fontSize: 10,
              }}
            >
              {item.label}
            </Text>
          </UnstyledButton>
        );
      })}
    </Box>
  );
}

export default AppShell;
