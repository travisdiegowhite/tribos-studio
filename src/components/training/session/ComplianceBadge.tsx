/** A session's compliance in one mark: a rule in the band's role colour, the label and the % of plan. */
import { Box, Group, Text } from '@mantine/core';
import { COMPLIANCE_STYLE, type Compliance } from '../../../lib/training/session/compliance';

const BASIS_WORD = { load: 'stress', time: 'time', distance: 'distance' } as const;

export function ComplianceBadge({ compliance, size = 'sm' }: { compliance: Compliance; size?: 'xs' | 'sm' }) {
  const style = COMPLIANCE_STYLE[compliance.band];
  const pct = compliance.ratio != null ? `${Math.round(compliance.ratio * 100)}% of planned ${compliance.basis ? BASIS_WORD[compliance.basis] : ''}`.trim() : null;
  return (
    <Group gap={6} wrap="nowrap" data-testid="compliance-badge" data-band={compliance.band}>
      <Box style={{ width: 4, alignSelf: 'stretch', minHeight: 14, background: style.strip }} />
      <Text size={size} fw={600}>{style.label}</Text>
      {pct && <Text size={size} c="dimmed">{pct}</Text>}
    </Group>
  );
}

export default ComplianceBadge;
