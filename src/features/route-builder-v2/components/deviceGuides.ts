/**
 * Guided "send" for devices we can't push to directly (Phase 2,
 * docs/ROUTE-BUILDER-COMPETITIVE-PLAN.md §3.7): download the file the device
 * imports best, then show how to get it there.
 *
 * - COROS: a route/push endpoint is in COROS's partner API, but its request
 *   format isn't public; a direct push waits on the spec (api@coros.com).
 * - Hammerhead Karoo: there's no partner API for routes; the Dashboard imports
 *   FIT/GPX files (karoo-ext can only drop a single pin).
 *
 * Steps are kept general because both apps move menus around.
 */
import type { ExportFormat } from '../../../hooks/route-builder/useRoutePersistence';

export type GuidedDevice = 'coros' | 'hammerhead';

export interface DeviceGuide {
  device: GuidedDevice;
  menuLabel: string;
  title: string;
  format: ExportFormat;
  steps: string[];
}

export const DEVICE_GUIDES: Record<GuidedDevice, DeviceGuide> = {
  coros: {
    device: 'coros',
    menuLabel: 'Send to COROS',
    title: 'Send this route to your COROS watch',
    format: 'gpx',
    steps: [
      'The GPX file has downloaded to this device.',
      'In the COROS app, open Routes and choose Import, then pick the file.',
      'Sync your watch from the app. The route shows up under Navigate when you start a ride.',
    ],
  },
  hammerhead: {
    device: 'hammerhead',
    menuLabel: 'Send to Hammerhead Karoo',
    title: 'Send this route to your Karoo',
    format: 'fit',
    steps: [
      'The FIT file has downloaded to this device. It includes the climbs and turn prompts.',
      'Open dashboard.hammerhead.io, go to Routes and choose Import, then upload the file.',
      'Your Karoo picks it up the next time it syncs. Start it from Routes on the device.',
    ],
  },
};
