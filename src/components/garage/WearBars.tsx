import { Box, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type { ComponentWear } from '../../lib/gear/wearSeries';
import { formatWhole } from '../../lib/gear/wearSeries';
import { StatusChip } from './StatusChip';
import { FONT, levelColor, monoCaption, monoLabel } from './garageTokens';

interface WearBarsProps {
  parts: ComponentWear[];
  useImperial: boolean;
  isLowerBound: boolean;
}

/**
 * One row per active part, per the design-system bar spec: mono label, 18px
 * track, status-coloured fill, a tick at the warning point, the value in the
 * display face, and the plain-word chip. Age-based parts are striped.
 */
export function WearBars({ parts, useImperial, isLowerBound }: WearBarsProps) {
  const compact = useMediaQuery('(max-width: 768px)');
  const active = parts.filter((p) => p.status === 'active');
  const unit = useImperial ? 'mi' : 'km';

  if (active.length === 0) {
    return <Text size="sm" c="dimmed">No parts on this bike yet.</Text>;
  }

  return (
    <Stack gap={compact ? 12 : 10}>
      {active.map((p) => {
        const color = levelColor(p.level);
        const age = p.wearModel === 'time' || p.wearModel === 'hours';
        const none = p.wearModel === 'none';
        const warnAt = p.replaceM && p.warningM ? Math.min(0.98, p.warningM / p.replaceM) : 0.8;
        const value = none
          ? 'specs only'
          : age
            ? `${Math.round((p.ageDays ?? 0) / 30.44)} of ${p.serviceMonths ?? '?'} months`
            : `${formatWhole(p.effectiveWearM, useImperial)} / ${p.replaceM ? formatWhole(p.replaceM, useImperial) : '?'} ${unit}`;
        const sub = [p.brand, p.model].filter(Boolean).join(' ');

        const labelCell = compact ? (
          <Box style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={monoLabel}>{p.label}</span>
            {sub && <span style={{ fontFamily: FONT.body, fontSize: 12, color: 'var(--color-text-muted)' }}>{sub}</span>}
          </Box>
        ) : (
          <Box style={{ width: 118, flex: '0 0 118px', textAlign: 'right' }}>
            <div style={monoLabel}>{p.label}</div>
            {sub && <div style={{ fontFamily: FONT.body, fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
          </Box>
        );

        const track = (
          <Box style={{ position: 'relative', height: 18, background: 'var(--color-bg-secondary)', flex: '1 1 auto' }} aria-label={p.sentence}>
            {!none && (
              <Box
                style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${Math.min(100, p.pct * 100).toFixed(1)}%`,
                  background: color,
                  backgroundImage: age ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.35) 0 3px, transparent 3px 7px)' : undefined,
                  transition: 'width 0.3s ease',
                }}
              />
            )}
            {!none && (
              <Box style={{ position: 'absolute', left: `${(warnAt * 100).toFixed(1)}%`, top: -3, bottom: -3, width: 1, background: 'var(--color-text-secondary)', opacity: 0.6 }} />
            )}
          </Box>
        );

        const valueCell = (
          <span style={{ fontFamily: FONT.display, fontSize: 13, fontWeight: 600, color: none ? 'var(--color-text-muted)' : color, whiteSpace: 'nowrap', ...(compact ? {} : { width: 132, flex: '0 0 132px' }) }}>
            {value}
          </span>
        );

        if (compact) {
          return (
            <Box key={p.componentId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {labelCell}
              <Box style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {track}
                <StatusChip level={p.level} word={(p.word ?? 'specs').toUpperCase()} />
              </Box>
              {valueCell}
            </Box>
          );
        }
        return (
          <Box key={p.componentId} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {labelCell}
            {track}
            {valueCell}
            <span style={{ width: 132, flex: '0 0 132px' }}>
              <StatusChip level={p.level} word={(p.word ?? 'specs').toUpperCase()} />
            </span>
          </Box>
        );
      })}
      <Text style={monoCaption}>
        wet and gravel miles count extra · the tick is the warning point · age-based parts are striped
        {isLowerBound ? ' · weather isn’t stamped on rides yet, so these are a floor' : ''}
      </Text>
    </Stack>
  );
}
