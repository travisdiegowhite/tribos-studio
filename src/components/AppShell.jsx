import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Group,
  Text,
  UnstyledButton,
  Menu,
  Badge,
  Stack,
  CloseButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useMantineColorScheme } from '@mantine/core';
import {
  Gear,
  Sun,
  Moon,
  SignOut,
  Bicycle,
  Users,
  Bell,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { useGear } from '../hooks/useGear.ts';
import { useActivation } from '../hooks/useActivation.ts';
import { formatDistance } from '../utils/units';
import { ListChecks } from '@phosphor-icons/react';

// Four-tab primary navigation: TODAY · RIDE · TRAIN · PROGRESS
const navItems = [
  { path: '/today', label: 'TODAY' },
  { path: '/ride', label: 'RIDE' },
  { path: '/train', label: 'TRAIN' },
  { path: '/progress', label: 'PROGRESS' },
];

function AppShell({ children, fullWidth = false, hideNav = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { user, signOut } = useAuth();
  const consentPersisted = useRef(false);

  // Gear maintenance alerts for notification bell
  const { alerts: gearAlerts = [], dismissAlert: dismissGearAlert } = useGear({ userId: user?.id, alertsOnly: true });

  // Activation guide — undismiss support
  const { isDismissed: guideIsDismissed, isComplete: guideIsComplete, undismissGuide } = useActivation(user?.id);

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
    if (item.path === '/today') {
      return location.pathname === '/today' || location.pathname === '/dashboard';
    }
    if (item.path === '/ride') {
      return location.pathname.startsWith('/ride') || location.pathname.startsWith('/routes');
    }
    if (item.path === '/train') {
      return location.pathname.startsWith('/train') || location.pathname === '/planner';
    }
    if (item.path === '/progress') {
      return location.pathname === '/progress';
    }
    return false;
  };

  // User initials for avatar
  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email
      ? user.email[0].toUpperCase()
      : '?';

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <Box
      style={{
        minHeight: '100dvh',
        backgroundColor: 'var(--color-bg)',
        paddingBottom: isMobile && !hideNav ? 64 : 0,
      }}
    >
      {/* Header — dark nav bar */}
      {!hideNav && (
        <>
          <Box
            component="header"
            style={{
              height: 60,
              backgroundColor: '#141410',
              position: 'sticky',
              top: 0,
              zIndex: 100,
            }}
          >
            <Box
              h="100%"
              px={20}
              style={{
                maxWidth: fullWidth ? '100%' : 1200,
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {/* Left: TRIBOS wordmark */}
              <Link to="/today" style={{ textDecoration: 'none' }}>
                <Text
                  fw={700}
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 22,
                    color: '#FFFFFF',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  TRIBOS
                </Text>
              </Link>

              {/* Center: Desktop navigation tabs */}
              {!isMobile && (
                <Group gap={0} style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
                  {navItems.map((item) => {
                    const active = isActive(item);
                    return (
                      <UnstyledButton
                        key={item.path}
                        component={Link}
                        to={item.path}
                        style={{
                          padding: '0 28px',
                          height: 60,
                          display: 'flex',
                          alignItems: 'center',
                          position: 'relative',
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: "'Barlow Condensed', sans-serif",
                            fontSize: 16,
                            fontWeight: 700,
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            color: active ? '#FFFFFF' : '#9A9990',
                            transition: 'color 150ms ease',
                          }}
                        >
                          {item.label}
                        </Text>
                        {/* Active indicator — 2px teal underline flush to bottom */}
                        {active && (
                          <Box
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 28,
                              right: 28,
                              height: 2,
                              backgroundColor: 'var(--color-teal)',
                            }}
                          />
                        )}
                      </UnstyledButton>
                    );
                  })}
                </Group>
              )}

              {/* Right: Notification bell + Avatar dropdown */}
              <Group gap="sm">
                <NotificationBell
                  gearAlerts={gearAlerts}
                  onDismissAlert={dismissGearAlert}
                  navigate={navigate}
                />
                <AvatarDropdown
                  initials={userInitials}
                  colorScheme={colorScheme}
                  toggleColorScheme={toggleColorScheme}
                  onSignOut={handleSignOut}
                  navigate={navigate}
                  showChecklist={guideIsDismissed && !guideIsComplete}
                  onUndismissGuide={undismissGuide}
                />
              </Group>
            </Box>
          </Box>

          {/* Retro stripe — brand signature */}
          <Box
            style={{
              display: 'flex',
              height: 3,
              position: 'sticky',
              top: 60,
              zIndex: 99,
            }}
          >
            <Box style={{ flex: 3, backgroundColor: '#2A8C82' }} />
            <Box style={{ flex: 2, backgroundColor: '#C49A0A' }} />
            <Box style={{ flex: 1, backgroundColor: '#F4F4F2' }} />
            <Box style={{ flex: 2, backgroundColor: '#D4600A' }} />
            <Box style={{ flex: 2, backgroundColor: '#C43C2A' }} />
          </Box>
        </>
      )}

      {/* Main content */}
      <Box component="main">{children}</Box>

      {/* Mobile Bottom Tab Bar — 4 tabs */}
      {isMobile && !hideNav && (
        <MobileBottomNav navItems={navItems} isActive={isActive} />
      )}
    </Box>
  );
}

// Notification bell with gear alerts
function NotificationBell({ gearAlerts = [], onDismissAlert, navigate }) {
  const alertCount = gearAlerts.length;
  const hasCritical = gearAlerts.some(a => a.level === 'critical');

  return (
    <Menu shadow="md" width={320} position="bottom-end" offset={8}>
      <Menu.Target>
        <UnstyledButton
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            position: 'relative',
          }}
        >
          <Bell size={20} color={alertCount > 0 ? '#FFFFFF' : '#9A9990'} />
          {alertCount > 0 && (
            <Badge
              size="xs"
              variant="filled"
              color={hasCritical ? 'red' : 'orange'}
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                padding: '0 4px',
                minWidth: 16,
                height: 16,
                fontSize: 10,
                fontWeight: 700,
                pointerEvents: 'none',
              }}
            >
              {alertCount}
            </Badge>
          )}
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        {alertCount === 0 ? (
          <Menu.Item disabled>
            <Text size="sm" c="dimmed">No alerts</Text>
          </Menu.Item>
        ) : (
          <>
            <Menu.Label>
              <Group justify="space-between">
                <Text size="xs" fw={700} tt="uppercase" style={{ letterSpacing: '1px' }}>
                  Gear Alerts
                </Text>
                <Text
                  size="xs"
                  c="teal"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/gear')}
                >
                  View all
                </Text>
              </Group>
            </Menu.Label>
            {gearAlerts.slice(0, 5).map((alert) => {
              const key = `${alert.gearItemId}-${alert.componentId || 'item'}-${alert.type}`;
              const isCrit = alert.level === 'critical';
              return (
                <Menu.Item
                  key={key}
                  leftSection={isCrit ? <WarningCircle size={16} color="var(--mantine-color-red-6)" /> : <Warning size={16} color="var(--mantine-color-orange-6)" />}
                  rightSection={
                    onDismissAlert && (
                      <CloseButton
                        size="xs"
                        onClick={(e) => { e.stopPropagation(); onDismissAlert(alert); }}
                      />
                    )
                  }
                  onClick={() => navigate('/gear')}
                >
                  <Text size="sm" fw={500} truncate>{alert.gearName}</Text>
                  <Text size="xs" c="dimmed" truncate>
                    {alert.componentType ? `${alert.componentType} — ` : ''}
                    {alert.type === 'replace' ? 'needs replacement' : 'maintenance due'}
                  </Text>
                </Menu.Item>
              );
            })}
            {alertCount > 5 && (
              <Menu.Item onClick={() => navigate('/gear')}>
                <Text size="xs" c="teal">+{alertCount - 5} more</Text>
              </Menu.Item>
            )}
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

// Avatar with dropdown menu (Settings, Gear, Cafe, Dark mode, Sign out)
function AvatarDropdown({ initials, colorScheme, toggleColorScheme, onSignOut, navigate, showChecklist, onUndismissGuide }) {
  return (
    <Menu shadow="md" width={220} position="bottom-end" offset={8}>
      <Menu.Target>
        <UnstyledButton
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            backgroundColor: 'var(--color-teal)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Text
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 15,
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: '0.5px',
              lineHeight: 1,
            }}
          >
            {initials}
          </Text>
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Gear size={18} />}
          onClick={() => navigate('/settings')}
        >
          Settings
        </Menu.Item>
        <Menu.Item
          leftSection={<Bicycle size={18} />}
          onClick={() => navigate('/gear')}
        >
          Gear
        </Menu.Item>
        <Menu.Item
          leftSection={<Users size={18} />}
          onClick={() => navigate('/community')}
        >
          Cafe
        </Menu.Item>
        {showChecklist && (
          <Menu.Item
            leftSection={<ListChecks size={18} />}
            onClick={() => { onUndismissGuide?.(); navigate('/today'); }}
          >
            Setup checklist
          </Menu.Item>
        )}
        <Menu.Divider />
        <Menu.Item
          leftSection={colorScheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          onClick={toggleColorScheme}
        >
          {colorScheme === 'dark' ? 'Light mode' : 'Dark mode'}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<SignOut size={18} />}
          color="red"
          onClick={onSignOut}
        >
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

// Mobile bottom nav — 4 tabs
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
        backgroundColor: '#141410',
        zIndex: 100,
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {navItems.map((item) => {
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
              minHeight: 44,
              position: 'relative',
            }}
          >
            {/* Active indicator — top bar */}
            {active && (
              <Box
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '25%',
                  right: '25%',
                  height: 2,
                  backgroundColor: 'var(--color-teal)',
                }}
              />
            )}
            <Text
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
                color: active ? '#FFFFFF' : '#9A9990',
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
