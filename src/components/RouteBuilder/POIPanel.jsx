/**
 * POIPanel — Sidebar/bottom-sheet panel listing POIs grouped by category.
 * Shows category toggle chips and a scrollable list of POIs along the route.
 */

import { Box, Text, Badge, Group, Stack, ActionIcon, Chip, Tooltip, Loader, Divider } from '@mantine/core';
import { IconDroplet, IconCoffee, IconTool, IconEye, IconDoor, IconX, IconExternalLink } from '@tabler/icons-react';
import { tokens } from '../../theme';
import { POI_CATEGORIES } from '../../utils/routePOIService';

const ICON_MAP = {
  water: IconDroplet,
  food: IconCoffee,
  bike_shop: IconTool,
  viewpoint: IconEye,
  restroom: IconDoor,
};

/**
 * @param {Object}   props
 * @param {Array}    props.pois              POI objects from queryPOIsAlongRoute
 * @param {boolean}  props.loading           Whether POIs are currently loading
 * @param {Set}      props.activeCategories  Set of active category IDs
 * @param {Function} props.onToggleCategory  Toggle a category on/off
 * @param {Function} props.onSelectPOI       Called when user clicks a POI to focus map
 * @param {string|null} props.selectedId     Currently selected POI id
 * @param {Function} props.onClose           Close the panel
 * @param {Function} props.formatDist        Distance formatter
 */
export default function POIPanel({
  pois,
  loading,
  activeCategories,
  onToggleCategory,
  onSelectPOI,
  selectedId,
  onClose,
  formatDist,
}) {
  // Group POIs by category
  const grouped = {};
  for (const cat of Object.keys(POI_CATEGORIES)) {
    grouped[cat] = (pois || []).filter(p => p.category === cat && activeCategories.has(cat));
  }
  const totalVisible = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <Box
      style={{
        backgroundColor: 'var(--tribos-bg-secondary)',
        borderRadius: tokens.radius.md,
        border: '1px solid var(--tribos-bg-tertiary)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Group
        justify="space-between"
        px="sm"
        py="xs"
        style={{ borderBottom: '1px solid var(--tribos-bg-tertiary)' }}
      >
        <Group gap={6}>
          <Text size="sm" fw={600} style={{ color: 'var(--tribos-text-primary)' }}>
            Nearby POIs
          </Text>
          {loading ? (
            <Loader size={14} color="lime" />
          ) : (
            <Badge size="xs" variant="light" color="lime">{totalVisible}</Badge>
          )}
        </Group>
        <ActionIcon size="sm" variant="subtle" onClick={onClose} color="gray">
          <IconX size={14} />
        </ActionIcon>
      </Group>

      {/* Category chips */}
      <Group gap={4} px="sm" py={6} wrap="wrap">
        {Object.values(POI_CATEGORIES).map(cat => {
          const Icon = ICON_MAP[cat.id];
          const isActive = activeCategories.has(cat.id);
          const count = (pois || []).filter(p => p.category === cat.id).length;
          return (
            <Chip
              key={cat.id}
              checked={isActive}
              onChange={() => onToggleCategory(cat.id)}
              size="xs"
              variant="outline"
              color={cat.color}
              styles={{
                label: {
                  paddingLeft: 6,
                  paddingRight: 8,
                  cursor: 'pointer',
                  backgroundColor: isActive ? cat.color + '20' : 'transparent',
                  borderColor: isActive ? cat.color : 'var(--tribos-bg-elevated)',
                  color: isActive ? cat.color : 'var(--tribos-text-muted)',
                },
                iconWrapper: { display: 'none' },
              }}
            >
              <Group gap={4} wrap="nowrap">
                <Icon size={12} />
                <span>{cat.label}</span>
                {count > 0 && <Badge size="xs" variant="filled" color={cat.color} circle>{count}</Badge>}
              </Group>
            </Chip>
          );
        })}
      </Group>

      <Divider color="var(--tribos-bg-tertiary)" />

      {/* POI list */}
      <Box
        style={{
          maxHeight: 260,
          overflowY: 'auto',
          padding: tokens.spacing.xs,
        }}
      >
        {loading && totalVisible === 0 ? (
          <Text size="xs" ta="center" py="md" style={{ color: 'var(--tribos-text-muted)' }}>
            Searching for nearby points of interest…
          </Text>
        ) : totalVisible === 0 ? (
          <Text size="xs" ta="center" py="md" style={{ color: 'var(--tribos-text-muted)' }}>
            No POIs found along this route. Try enabling more categories.
          </Text>
        ) : (
          <Stack gap={2}>
            {Object.entries(grouped).map(([catId, catPois]) =>
              catPois.map(poi => {
                const cat = POI_CATEGORIES[catId];
                const Icon = ICON_MAP[catId];
                const isSelected = selectedId === poi.id;
                return (
                  <Box
                    key={poi.id}
                    onClick={() => onSelectPOI(poi)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: tokens.radius.sm,
                      cursor: 'pointer',
                      backgroundColor: isSelected ? cat.color + '18' : 'transparent',
                      border: isSelected ? `1px solid ${cat.color}40` : '1px solid transparent',
                      transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--tribos-bg-tertiary)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <Group gap={8} wrap="nowrap">
                      <Box style={{ color: cat.color, flexShrink: 0 }}>
                        <Icon size={16} />
                      </Box>
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          size="xs"
                          fw={500}
                          lineClamp={1}
                          style={{ color: 'var(--tribos-text-primary)' }}
                        >
                          {poi.name}
                        </Text>
                        <Group gap={6}>
                          <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                            km {poi.routeDistanceKm}
                          </Text>
                          {poi.offRouteDistanceM > 50 && (
                            <Text size="xs" style={{ color: 'var(--tribos-text-muted)' }}>
                              • {poi.offRouteDistanceM}m off route
                            </Text>
                          )}
                        </Group>
                      </Box>
                      {poi.website && (
                        <Tooltip label="Open website">
                          <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="gray"
                            component="a"
                            href={poi.website}
                            target="_blank"
                            rel="noopener"
                            onClick={e => e.stopPropagation()}
                          >
                            <IconExternalLink size={12} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Box>
                );
              })
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
