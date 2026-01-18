import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Group,
  Text,
  UnstyledButton,
  Container,
  Menu,
  Drawer,
  Stack,
  Divider,
} from '@mantine/core';
import { useMediaQuery, useDisclosure } from '@mantine/hooks';
import {
  IconHome,
  IconRoute,
  IconChartLine,
  IconSettings,
  IconPlus,
  IconList,
  IconCalendarEvent,
  IconChartBar,
  IconChevronDown,
  IconCoffee,
} from '@tabler/icons-react';
import { tokens } from '../theme';
import BetaFeedbackWidget from './BetaFeedbackWidget.jsx';

// Nav structure - 5 main items including Community
const navItems = [
  { path: '/dashboard', label: 'Home', icon: IconHome },
  {
    label: 'Routes',
    icon: IconRoute,
    dropdown: [
      { path: '/routes/new', label: 'Create Route', icon: IconPlus },
      { path: '/routes/list', label: 'My Routes', icon: IconList },
    ],
  },
  {
    label: 'Training',
    icon: IconChartLine,
    dropdown: [
      { path: '/planner', label: 'Plan', icon: IconCalendarEvent },
      { path: '/training', label: 'Analysis', icon: IconChartBar },
    ],
  },
  { path: '/community', label: 'The Cafe', icon: IconCoffee },
  { path: '/settings', label: 'Settings', icon: IconSettings },
];

function AppShell({ children, fullWidth = false, hideNav = false }) {
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [mobileDrawerOpened, { open: openMobileDrawer, close: closeMobileDrawer }] = useDisclosure(false);
  const [activeDropdown, setActiveDropdown] = useState(null);

  // Check if current path matches nav item or its dropdown items
  const isActive = (item) => {
    if (item.path) {
      return location.pathname === item.path || location.pathname.startsWith(item.path + '/');
    }
    if (item.dropdown) {
      return item.dropdown.some(
        (sub) => location.pathname === sub.path || location.pathname.startsWith(sub.path + '/')
      );
    }
    return false;
  };

  // Get active dropdown label for display
  const getActiveDropdownLabel = (item) => {
    if (!item.dropdown) return null;
    const activeItem = item.dropdown.find(
      (sub) => location.pathname === sub.path || location.pathname.startsWith(sub.path + '/')
    );
    return activeItem?.label;
  };

  return (
    <Box
      style={{
        minHeight: '100dvh',
        backgroundColor: tokens.colors.bgPrimary,
        paddingBottom: isMobile && !hideNav ? 64 : 0,
      }}
    >
      {/* Header - Clean, Linear-inspired */}
      <Box
        component="header"
        style={{
          height: 56,
          backgroundColor: tokens.colors.bgPrimary,
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
                size="md"
                style={{
                  color: tokens.colors.textPrimary,
                  letterSpacing: '-0.02em',
                }}
              >
                TRIBOS
              </Text>
            </Link>

            {/* Desktop Navigation */}
            {!isMobile && (
              <Group gap={4}>
                {navItems.map((item) =>
                  item.dropdown ? (
                    <DesktopDropdownNav
                      key={item.label}
                      item={item}
                      active={isActive(item)}
                      activeLabel={getActiveDropdownLabel(item)}
                    />
                  ) : (
                    <DesktopNavLink
                      key={item.path}
                      to={item.path}
                      label={item.label}
                      icon={item.icon}
                      active={isActive(item)}
                    />
                  )
                )}
                <Box ml="sm">
                  <BetaFeedbackWidget />
                </Box>
              </Group>
            )}

            {/* Mobile: Feedback button in header */}
            {isMobile && <BetaFeedbackWidget />}
          </Group>
        </Container>
      </Box>

      {/* Main content */}
      <Box component="main">{children}</Box>

      {/* Mobile Bottom Tab Bar - Cleaner with 4 items */}
      {isMobile && !hideNav && (
        <MobileBottomNav
          navItems={navItems}
          isActive={isActive}
          openDrawer={openMobileDrawer}
          activeDropdown={activeDropdown}
          setActiveDropdown={setActiveDropdown}
        />
      )}

      {/* Mobile Dropdown Drawer */}
      <Drawer
        opened={mobileDrawerOpened}
        onClose={closeMobileDrawer}
        position="bottom"
        size="auto"
        withCloseButton={false}
        styles={{
          content: {
            backgroundColor: tokens.colors.bgSecondary,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          },
          body: {
            padding: 0,
          },
        }}
      >
        <MobileDrawerContent
          item={navItems.find((n) => n.label === activeDropdown)}
          onClose={closeMobileDrawer}
          isActive={isActive}
        />
      </Drawer>
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
        backgroundColor: active ? tokens.colors.bgTertiary : 'transparent',
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = tokens.colors.bgSecondary;
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
          color={active ? tokens.colors.electricLime : tokens.colors.textSecondary}
          stroke={1.5}
        />
        <Text
          size="sm"
          fw={active ? 500 : 400}
          style={{
            color: active ? tokens.colors.textPrimary : tokens.colors.textSecondary,
          }}
        >
          {label}
        </Text>
      </Group>
    </UnstyledButton>
  );
}

// Desktop dropdown nav
function DesktopDropdownNav({ item, active, activeLabel }) {
  const Icon = item.icon;
  const navigate = useNavigate();

  return (
    <Menu
      trigger="hover"
      openDelay={50}
      closeDelay={100}
      position="bottom-start"
      offset={4}
      styles={{
        dropdown: {
          backgroundColor: tokens.colors.bgSecondary,
          border: `1px solid ${tokens.colors.bgTertiary}`,
          borderRadius: 8,
          padding: 4,
          minWidth: 160,
        },
        item: {
          padding: '8px 12px',
          borderRadius: 6,
          '&[data-hovered]': {
            backgroundColor: tokens.colors.bgTertiary,
          },
        },
      }}
    >
      <Menu.Target>
        <UnstyledButton
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            backgroundColor: active ? tokens.colors.bgTertiary : 'transparent',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (!active) {
              e.currentTarget.style.backgroundColor = tokens.colors.bgSecondary;
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
              color={active ? tokens.colors.electricLime : tokens.colors.textSecondary}
              stroke={1.5}
            />
            <Text
              size="sm"
              fw={active ? 500 : 400}
              style={{
                color: active ? tokens.colors.textPrimary : tokens.colors.textSecondary,
              }}
            >
              {activeLabel || item.label}
            </Text>
            <IconChevronDown
              size={12}
              color={tokens.colors.textMuted}
              stroke={1.5}
            />
          </Group>
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        {item.dropdown.map((subItem) => {
          const SubIcon = subItem.icon;
          return (
            <Menu.Item
              key={subItem.path}
              leftSection={
                <SubIcon size={14} color={tokens.colors.textSecondary} stroke={1.5} />
              }
              onClick={() => navigate(subItem.path)}
            >
              <Text size="sm" style={{ color: tokens.colors.textPrimary }}>
                {subItem.label}
              </Text>
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}

// Mobile bottom nav - 4 items
function MobileBottomNav({ navItems, isActive, openDrawer, activeDropdown, setActiveDropdown }) {
  const navigate = useNavigate();

  const handleNavClick = (item) => {
    if (item.dropdown) {
      setActiveDropdown(item.label);
      openDrawer();
    } else {
      navigate(item.path);
    }
  };

  return (
    <Box
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        backgroundColor: tokens.colors.bgSecondary,
        borderTop: `1px solid ${tokens.colors.bgTertiary}`,
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
            key={item.label}
            onClick={() => handleNavClick(item)}
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
              size={22}
              color={active ? tokens.colors.electricLime : tokens.colors.textSecondary}
              stroke={active ? 2 : 1.5}
            />
            <Text
              size="xs"
              fw={active ? 500 : 400}
              style={{
                color: active ? tokens.colors.electricLime : tokens.colors.textSecondary,
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

// Mobile drawer content for dropdown items
function MobileDrawerContent({ item, onClose, isActive }) {
  const navigate = useNavigate();

  if (!item || !item.dropdown) return null;

  const handleItemClick = (path) => {
    navigate(path);
    onClose();
  };

  return (
    <Box p="md" pb="xl">
      {/* Drag handle indicator */}
      <Box
        style={{
          width: 36,
          height: 4,
          backgroundColor: tokens.colors.bgTertiary,
          borderRadius: 2,
          margin: '0 auto 16px',
        }}
      />

      <Text fw={600} size="sm" c="dimmed" mb="sm" tt="uppercase">
        {item.label}
      </Text>

      <Stack gap="xs">
        {item.dropdown.map((subItem) => {
          const SubIcon = subItem.icon;
          const active =
            location.pathname === subItem.path ||
            location.pathname.startsWith(subItem.path + '/');

          return (
            <UnstyledButton
              key={subItem.path}
              onClick={() => handleItemClick(subItem.path)}
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                backgroundColor: active ? tokens.colors.bgTertiary : 'transparent',
                border: `1px solid ${active ? tokens.colors.electricLime + '40' : 'transparent'}`,
              }}
            >
              <Group gap="sm">
                <SubIcon
                  size={20}
                  color={active ? tokens.colors.electricLime : tokens.colors.textSecondary}
                  stroke={1.5}
                />
                <Text
                  size="md"
                  fw={active ? 500 : 400}
                  style={{
                    color: active ? tokens.colors.textPrimary : tokens.colors.textSecondary,
                  }}
                >
                  {subItem.label}
                </Text>
              </Group>
            </UnstyledButton>
          );
        })}
      </Stack>
    </Box>
  );
}

export default AppShell;
