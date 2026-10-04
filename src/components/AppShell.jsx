import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
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
  Users,
  Bell,
  Warning,
  WarningCircle,
} from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabase';
import { ensureUserProfile } from '../utils/ensureProfile';
import LifecycleOverlays from './LifecycleOverlays.jsx';
import { useGear } from '../hooks/useGear.ts';
import { useActivation } from '../hooks/useActivation.ts';
import { formatDistance } from '../utils/units';
import { ListChecks, Wrench } from '@phosphor-icons/react';
import { isShopOwner } from '../features/shop/owner.ts';

// Primary navigation: TODAY · RIDE · TRAIN · PROGRESS · GARAGE.
// GARAGE is the gear tracker (bikes, parts, wear); /gear redirects to it.
// RIDE opens the route builder directly (/ride redirects to /ride/new; the
// tab stays active anywhere under /ride). The old route-library hub is kept
// as a fallback at /ride/library.
//
// The conditional CALENDAR tab is gone with the parallel surface it opened:
// /train IS the calendar_entries calendar now, for everyone.
const NAV_ITEMS = [
  { path: '/today', label: 'Today' },
  { path: '/ride', label: 'Ride' },
  { path: '/train', label: 'Train' },
  { path: '/progress', label: 'Progress' },
  { path: '/garage', label: 'Garage' },
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

  // First authenticated load: make sure the profile row exists (no DB
  // trigger creates it), then persist any consent captured at signup.
  // The consent write is an upsert too, so it can never no-op against a
  // missing row — which is exactly how it used to lose ToS/privacy
  // acceptance for athletes who never finished the onboarding wizard.
  useEffect(() => {
    if (!user?.id || consentPersisted.current) return;
    consentPersisted.current = true;

    const persist = async () => {
      await ensureUserProfile(user.id);
      try {
        const pending = localStorage.getItem('tribos_consent_pending');
        if (!pending) return;
        const consent = JSON.parse(pending);
        const { error } = await supabase
          .from('user_profiles')
          .upsert({ id: user.id, ...consent }, { onConflict: 'id' });
        if (!error) localStorage.removeItem('tribos_consent_pending');
      } catch {
        // Ignore localStorage/JSON errors; the pending key stays for a retry.
      }
    };
    persist().catch(() => {}); // Non-blocking
  }, [user?.id]);

  // Check if current path matches nav item
  const isActive = (item) => {
    if (item.path === '/today') {
      return location.pathname === '/today' || location.pathname === '/dashboard';
    }
    if (item.path === '/ride') {
      return (
        location.pathname.startsWith('/ride') ||
        location.pathname.startsWith('/routes') ||
        location.pathname.startsWith('/route-builder-2')
      );
    }
    if (item.path === '/train') {
      return location.pathname.startsWith('/train') || location.pathname === '/planner';
    }
    if (item.path === '/progress') {
      return location.pathname === '/progress';
    }
    if (item.path === '/garage') {
      // /gear is the legacy path; it redirects here but may still be mid-transition.
      return location.pathname.startsWith('/garage') || location.pathname.startsWith('/gear');
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
      {/* Header — paper masthead over a single ink rule */}
      {!hideNav && (
        <>
          <Box
            component="header"
            style={{
              height: 60,
              backgroundColor: 'var(--color-nav-bg)',
              borderBottom: '2px solid var(--color-ink)',
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
              {/* Left: wordmark */}
              <Link to="/today" style={{ textDecoration: 'none' }}>
                <Text
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 900,
                    fontSize: 32,
                    lineHeight: 1,
                    color: 'var(--color-nav-text)',
                    textTransform: 'uppercase',
                  }}
                >
                  tribos
                </Text>
              </Link>

              {/* Center: Desktop navigation tabs */}
              {!isMobile && (
                <Group gap={0} style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
                  {NAV_ITEMS.map((item) => {
                    const active = isActive(item);
                    return (
                      <UnstyledButton
                        key={item.path}
                        component={Link}
                        to={item.path}
                        style={{
                          padding: '0 4px',
                          height: 60,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        {/* Active tab is a filled block of the blue accent, zine-masthead style */}
                        <Text
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontStretch: '75%',
                            fontSize: 16,
                            fontWeight: 800,
                            padding: '8px 14px',
                            backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                            color: active ? 'var(--tribos-on-accent)' : 'var(--color-nav-text)',
                            transition: 'color 150ms ease',
                          }}
                        >
                          {item.label}
                        </Text>
                      </UnstyledButton>
                    );
                  })}
                </Group>
              )}

              {/* Right: Notification bell + Avatar dropdown — or, for
                  guests (open route builder, no session), auth CTAs. */}
              {user ? (
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
                    showShop={isShopOwner(user?.email)}
                  />
                </Group>
              ) : (
                <Group gap="sm">
                  {!isMobile && (
                    <>
                      <Button
                        component={Link}
                        to="/welcome"
                        size="xs"
                        variant="subtle"
                        color="gray"
                        style={{ color: 'var(--color-nav-text-muted)' }}
                      >
                        About
                      </Button>
                      <Button
                        component={Link}
                        to="/auth"
                        size="xs"
                        variant="subtle"
                        color="gray"
                        style={{ color: 'var(--color-nav-text-muted)' }}
                      >
                        Log in
                      </Button>
                    </>
                  )}
                  <Button
                    component={Link}
                    to="/auth"
                    size="xs"
                    style={{ backgroundColor: 'var(--color-nav-text)', color: 'var(--color-nav-bg)' }}
                  >
                    Create free account
                  </Button>
                </Group>
              )}
            </Box>
          </Box>

        </>
      )}

      {/* Main content */}
      <Box component="main">{children}</Box>

      {/* App-wide lifecycle surfaces: onboarding, What's New, feedback button.
          The floating feedback button is suppressed on immersive full-width
          surfaces (route builder) where it would overlap map controls. */}
      {user && <LifecycleOverlays showFeedbackButton={!fullWidth && !hideNav} />}

      {/* Mobile Bottom Tab Bar — 5 tabs */}
      {isMobile && !hideNav && (
        <MobileBottomNav isActive={isActive} />
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
            color: 'var(--color-nav-text)',
          }}
          aria-label="Notifications"
        >
          <Bell size={20} color="currentColor" weight={alertCount > 0 ? 'fill' : 'regular'} />
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
                  onClick={() => navigate('/garage')}
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
                  onClick={() => navigate(alert.gearItemId ? `/garage/${alert.gearItemId}` : '/garage')}
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
              <Menu.Item onClick={() => navigate('/garage')}>
                <Text size="xs" c="teal">+{alertCount - 5} more</Text>
              </Menu.Item>
            )}
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

// Avatar with dropdown menu (Settings, Cafe, Shop for its owner, Dark mode, Sign out)
function AvatarDropdown({ initials, colorScheme, toggleColorScheme, onSignOut, navigate, showChecklist, onUndismissGuide, showShop }) {
  return (
    <Menu shadow="md" width={220} position="bottom-end" offset={8}>
      <Menu.Target>
        <UnstyledButton
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            backgroundColor: 'var(--color-nav-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Text
            style={{
              fontFamily: "'Archivo', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-nav-bg)',
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
          leftSection={<Users size={18} />}
          onClick={() => navigate('/community')}
        >
          Cafe
        </Menu.Item>
        {showShop && (
          <Menu.Item
            leftSection={<Wrench size={18} />}
            onClick={() => navigate('/shop')}
          >
            Shop
          </Menu.Item>
        )}
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

// Mobile bottom nav — 5 tabs
function MobileBottomNav({ isActive }) {
  const navigate = useNavigate();

  return (
    <Box
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        backgroundColor: 'var(--color-nav-bg)',
        borderTop: '1px solid var(--color-ink)',
        zIndex: 100,
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {NAV_ITEMS.map((item) => {
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
              // Five tabs on a 390px screen: tighter padding than the desktop
              // bar so Progress and Garage both fit un-wrapped.
              padding: '8px 4px',
              flex: 1,
              gap: 2,
              minHeight: 44,
              position: 'relative',
            }}
          >
            {/* Active indicator — 2px ink bar sitting on the top rule */}
            {active && (
              <Box
                style={{
                  position: 'absolute',
                  top: -1,
                  left: '25%',
                  right: '25%',
                  height: 2,
                  backgroundColor: 'var(--color-ink)',
                }}
              />
            )}
            <Text
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--color-nav-text)' : 'var(--color-nav-text-muted)',
                whiteSpace: 'nowrap',
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
