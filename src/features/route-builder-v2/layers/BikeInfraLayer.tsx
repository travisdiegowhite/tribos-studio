/**
 * BikeInfraLayer — Route Builder 2.0 bike infrastructure overlay.
 *
 * Wraps the existing BikeInfrastructureLayer. In P1.3, the infrastructure
 * data source is not yet wired into useRouteAnalysis. The layer renders
 * only when `data` is passed in; the page can wire in a real fetcher
 * later. Empty for now so the toggle still has a visual on/off effect.
 */

import LegacyBikeInfraLayerImport from '../../../components/BikeInfrastructureLayer.jsx';

const LegacyBikeInfraLayer = LegacyBikeInfraLayerImport as unknown as React.ComponentType<{
  data: unknown;
  visible: boolean;
  beforeId?: string;
}>;

export interface BikeInfraLayerProps {
  data: unknown | null;
  visible: boolean;
}

export function BikeInfraLayer({ data, visible }: BikeInfraLayerProps) {
  if (!visible || !data) return null;
  return <LegacyBikeInfraLayer data={data} visible={visible} />;
}

export default BikeInfraLayer;
