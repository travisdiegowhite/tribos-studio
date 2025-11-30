import { Link, useLocation } from 'react-router-dom';
import { Box, Group, Text, UnstyledButton, Container } from '@mantine/core';
import { tokens } from '../theme';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { path: '/routes', label: 'Routes', icon: '🗺️' },
  { path: '/training', label: 'Training', icon: '📊' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

function AppShell({ children, fullWidth = false }) {
  const location = useLocation();

  return (
    <Box style={{ minHeight: '100vh', backgroundColor: tokens.colors.bgPrimary }}>
      {/* Header */}
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

            {/* Navigation */}
            <Group gap="xs">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  label={item.label}
                  icon={item.icon}
                  active={location.pathname === item.path || location.pathname.startsWith(item.path + '/')}
                />
              ))}
            </Group>
          </Group>
        </Container>
      </Box>

      {/* Main content */}
      <Box component="main">{children}</Box>
    </Box>
  );
}

function NavLink({ to, label, icon, active }) {
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
        <Text size="sm">{icon}</Text>
        <Text
          size="sm"
          fw={active ? 600 : 400}
          style={{ color: active ? tokens.colors.textPrimary : tokens.colors.textSecondary }}
        >
          {label}
        </Text>
      </Group>
    </UnstyledButton>
  );
}

export default AppShell;
