import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Group,
  Text,
  UnstyledButton,
  Container,
  ActionIcon,
  Tooltip,
  Anchor,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useMantineColorScheme } from '@mantine/core';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import BetaFeedbackWidget from './BetaFeedbackWidget.jsx';
import { CalendarBlank, Gear, Heartbeat, House, MapTrifold, Moon, Sun, Users } from '@phosphor-icons/react';

// Flat navigation - 6 direct links, no dropdowns
const navItems = [
  { path: '/dashboard', label: 'Home', icon: House },
  { path: '/routes/new', label: 'Routes', icon: MapTrifold },
  { path: '/training', label: 'Training', icon: Heartbeat },
  { path: '/planner', label: 'Planner', icon: CalendarBlank },
  { path: '/community', label: 'Cafe', icon: Users },
  { path: '/settings', label: 'Settings', icon: Gear },
];

function AppShell({ children, fullWidth = false, hideNav = false }) {
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { user } = useAuth();
  const consentPersisted = useRef(false);

  // Persist pending consent from signup flow to user_profiles
  useEffect(() => {
    if (!user?.id || consentPersisted.current) return;
    consentPersisted.current = true;

    try {
      const pending = localStorage.getItem('tribos_consent_pending');
      if (pending) {
        const consent = JSON.parse(pending);
        supabase.from('user_profiles').update(consent).eq('id', user.id)
          .then(() => localStorage.removeItem('tribos_consent_pending'))
          .catch(() => {}); // Non-blocking
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [user?.id]);

  // Check if current path matches nav item
  const isActive = (item) => {
    // Special handling for routes - match all /routes/* paths
    if (item.path === '/routes/new') {
      return location.pathname.startsWith('/routes');
    }
    // Training matches /training paths only
    if (item.path === '/training') {
      return location.pathname.startsWith('/training');
    }
    // Planner matches /planner paths
    if (item.path === '/planner') {
      return location.pathname.startsWith('/planner');
    }
    // Special handling for settings - also match /gear paths
    if (item.path === '/settings') {
      return location.pathname === '/settings' || location.pathname.startsWith('/gear');
    }
    return location.pathname === item.path || location.pathname.startsWith(item.path + '/');
  };

  return (
    <Box
      style={{
        minHeight: '100dvh',
        backgroundColor: 'var(--color-bg)',
        paddingBottom: isMobile && !hideNav ? 64 : 0,
      }}
    >
      {/* Header - Clean, Linear-inspired */}
      <Box
        component="header"
        style={{
          height: 56,
          backgroundColor: 'var(--color-bg)',
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
                  color: 'var(--color-text-primary)',
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
                    {colorScheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
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
                  {colorScheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </ActionIcon>
                <BetaFeedbackWidget />
              </Group>
            )}
          </Group>
        </Container>
      </Box>

      {/* Main content */}
      <Box component="main">{children}</Box>

      {/* Desktop Footer with Privacy Links */}
      {!isMobile && (
        <Box
          component="footer"
          py="md"
          mt="xl"
          style={{
            borderTop: '1px solid var(--tribos-border)',
          }}
        >
          <Container size={fullWidth ? '100%' : 'xl'} px={fullWidth ? 'md' : undefined}>
            <Group justify="center" gap="lg">
              <Anchor href="/privacy" size="xs" style={{ color: 'var(--color-text-muted)' }}>
                Privacy
              </Anchor>
              <Anchor href="/terms" size="xs" style={{ color: 'var(--color-text-muted)' }}>
                Terms
              </Anchor>
              <Anchor href="mailto:travis@tribos.studio" size="xs" style={{ color: 'var(--color-text-muted)' }}>
                Contact
              </Anchor>
              <Anchor href="mailto:travis@tribos.studio?subject=Abuse%20Report" size="xs" style={{ color: 'var(--color-text-muted)' }}>
                Report Abuse
              </Anchor>
            </Group>
          </Container>
        </Box>
      )}

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
        backgroundColor: active ? 'var(--color-bg-secondary)' : 'transparent',
        transition: 'background-color 0.15s ease',
      }}
      className={!active ? 'tribos-nav-link' : undefined}
    >
      <Group gap={6}>
        <Icon
          size={16}
          color={active ? 'var(--color-teal)' : 'var(--color-text-secondary)'}
          
        />
        <Text
          size="sm"
          fw={active ? 500 : 400}
          style={{
            color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
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
        backgroundColor: 'var(--color-bg-secondary)',
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
              color={active ? 'var(--color-teal)' : 'var(--color-text-secondary)'}
              stroke={active ? 2 : 1.5}
            />
            <Text
              size="xs"
              fw={active ? 500 : 400}
              style={{
                color: active ? 'var(--color-teal)' : 'var(--color-text-secondary)',
                fontSize: 11,
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
