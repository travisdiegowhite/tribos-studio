/**
 * AvoidToggles — the rider's "Avoid" switches (Phase 2, §3.2): unpaved
 * surfaces and main roads. Settings, like comfort: they apply to drawing,
 * dragging and generating, and changing one re-routes the current line.
 * Ferries are avoided on every route already, so there's no switch for them.
 */
import { Box, Switch, Text } from '@mantine/core';
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';
import { trackRb2 } from '../telemetry/trackRb2';
import { RB2, RB2_FONT } from './brand';
import type { AvoidOptions } from '../../../utils/routeAvoid';

export function AvoidToggles() {
  const avoid = useRouteBuilderStore((s) => s.routeAvoid as AvoidOptions | undefined) ?? {
    unpaved: false,
    mainRoads: false,
  };
  const setRouteAvoid = useRouteBuilderStore(
    (s) => s.setRouteAvoid as (partial: Partial<AvoidOptions>) => void,
  );

  const toggle = (key: keyof AvoidOptions, next: boolean) => {
    setRouteAvoid({ [key]: next });
    trackRb2('avoid_toggled', { option: key, state: next ? 'on' : 'off' });
  };

  return (
    <Box data-testid="rb2-avoid-toggles">
      <Text
        style={{
          fontFamily: RB2_FONT.mono,
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: RB2.textTertiary,
          marginBottom: 6,
        }}
      >
        Avoid
      </Text>
      <Switch
        data-testid="rb2-avoid-unpaved"
        label="Unpaved roads"
        description="Keeps to paved surfaces where there's a choice."
        checked={avoid.unpaved}
        onChange={(e) => toggle('unpaved', e.currentTarget.checked)}
        size="sm"
        mb={8}
      />
      <Switch
        data-testid="rb2-avoid-main-roads"
        label="Main roads"
        description="Steers away from highways and arterials, even with a shoulder."
        checked={avoid.mainRoads}
        onChange={(e) => toggle('mainRoads', e.currentTarget.checked)}
        size="sm"
      />
    </Box>
  );
}

export default AvoidToggles;
