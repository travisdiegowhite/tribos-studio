import { Link, useLocation } from 'react-router-dom';
import { Box, Group, Text, UnstyledButton, Container } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconHome,
  IconRoute,
  IconChartBar,
  IconSettings,
  IconCalendarEvent,
} from '@tabler/icons-react';
import { tokens } from '../theme';
import BetaFeedbackWidget from './BetaFeedbackWidget.jsx';

const navItems = [
  { path: '/dashboard', label: 'Home', icon: IconHome },
  { path: '/routes', label: 'Routes', icon: IconRoute },
  { path: '/planner', label: 'Plan', icon: IconCalendarEvent, fullLabel: 'Plan Your Training' },
  { path: '/training', label: 'Analysis', icon: IconChartBar, fullLabel: 'Training Analysis' },
  { path: '/settings', label: 'Settings', icon: IconSettings },
];

function AppShell({ children, fullWidth = false, hideNav = false }) {
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 768px)');

  return (
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: tokens.colors.bgPrimary,
        paddingBottom: isMobile && !hideNav ? 70 : 0, // Space for bottom nav
      }}
    >
      {/* Header - simplified on mobile */}
      <Box
        component="header"
        style={{
          height: 60,
          backgroundColor: tokens.colors.bgSecondary,
          borderBottom: `1px solid ${tokens.colors.bgTertiary}`,
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
                size="lg"
                style={{
                  color: tokens.colors.electricLime,
                  letterSpacing: '0.05em',
                }}
              >
                TRIBOS
              </Text>
            </Link>

            {/* Desktop Navigation - hidden on mobile */}
            {!isMobile && (
              <Group gap="xs">
                {navItems.map((item) => (
                  <DesktopNavLink
                    key={item.path}
                    to={item.path}
                    label={item.label}
                    fullLabel={item.fullLabel}
                    icon={item.icon}
                    active={location.pathname === item.path || location.pathname.startsWith(item.path + '/')}
                  />
                ))}
                <BetaFeedbackWidget />
              </Group>
            )}

            {/* Mobile: Feedback button in header */}
            {isMobile && (
              <BetaFeedbackWidget />
            )}
          </Group>
        </Container>
      </Box>

      {/* Main content */}
      <Box component="main">{children}</Box>

      {/* Mobile Bottom Tab Bar */}
      {isMobile && !hideNav && (
        <Box
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: 70,
            backgroundColor: tokens.colors.bgSecondary,
            borderTop: `1px solid ${tokens.colors.bgTertiary}`,
            zIndex: 100,
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)', // iOS safe area
          }}
        >
          {navItems.map((item) => (
            <MobileNavLink
              key={item.path}
              to={item.path}
              label={item.label}
              icon={item.icon}
              active={location.pathname === item.path || location.pathname.startsWith(item.path + '/')}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

function DesktopNavLink({ to, label, fullLabel, icon: Icon, active }) {
  return (
    <UnstyledButton
      component={Link}
      to={to}
      style={{
        padding: '8px 16px',
        borderRadius: tokens.radius.md,
        backgroundColor: active ? tokens.colors.bgTertiary : 'transparent',
        transition: 'background-color 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = tokens.colors.bgTertiary;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      <Group gap="xs">
        <Icon size={18} color={active ? tokens.colors.electricLime : tokens.colors.textSecondary} />
        <Text
          size="sm"
          fw={active ? 600 : 400}
          style={{ color: active ? tokens.colors.textPrimary : tokens.colors.textSecondary }}
        >
          {fullLabel || label}
        </Text>
      </Group>
    </UnstyledButton>
  );
}

function MobileNavLink({ to, label, icon: Icon, active }) {
  return (
    <UnstyledButton
      component={Link}
      to={to}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 16px',
        flex: 1,
        gap: 4,
      }}
    >
      <Icon
        size={24}
        color={active ? tokens.colors.electricLime : tokens.colors.textSecondary}
        stroke={active ? 2 : 1.5}
      />
      <Text
        size="xs"
        fw={active ? 600 : 400}
        style={{
          color: active ? tokens.colors.electricLime : tokens.colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </UnstyledButton>
  );
}

export default AppShell;
