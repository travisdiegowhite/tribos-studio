import type { ColorToken } from '../../../utils/todayVocabulary';
import { colorVar } from '../../../utils/todayVocabulary';

interface Zone {
  start: number;
  end: number;
  token: ColorToken;
}

interface Props {
  /** Zones that paint the bar background, left to right. */
  zones: Zone[];
  /** Marker position along the bar in the same numeric space as the zones. */
  markerValue: number | null;
  /** Range bounds — used to convert marker / zone bounds to percentages. */
  min: number;
  max: number;
  /** Override marker color; defaults to ink. */
  markerColor?: string;
  height?: number;
}

/**
 * Horizontal zone-banded bar with a vertical marker. Used by FORM, FATIGUE,
 * EFI, and TCAS cells. Renders a single-zone variant when only one zone is
 * supplied (used by FITNESS).
 */
export function MetricBar({ zones, markerValue, min, max, markerColor = '#141410', height = 8 }: Props) {
  const span = max - min;
  if (span <= 0) return null;

  const markerPct =
    markerValue == null ? null : Math.max(0, Math.min(100, ((markerValue - min) / span) * 100));

  return (
    <div
      style={{
        position: 'relative',
        height,
        width: '100%',
        background: 'var(--color-bg-secondary)',
      }}
    >
      {zones.map((zone, idx) => {
        const left = Math.max(0, ((zone.start - min) / span) * 100);
        const right = Math.min(100, ((zone.end - min) / span) * 100);
        const width = Math.max(0, right - left);
        return (
          <div
            key={idx}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${left}%`,
              width: `${width}%`,
              background: colorVar(zone.token),
              opacity: 0.85,
            }}
          />
        );
      })}
      {markerPct != null && (
        <div
          style={{
            position: 'absolute',
            top: -2,
            bottom: -2,
            left: `calc(${markerPct}% - 1px)`,
            width: 2,
            background: markerColor,
          }}
        />
      )}
    </div>
  );
}
