/**
 * revertLastChatEdit — pop the most recent chat-edit checkpoint and write
 * it back to the route store. Backs the Keep/Revert review card; the
 * typed "revert" path (restore_previous via the coach) pops the same
 * stack, so button and chat stay in lockstep.
 *
 * Kept separate from editCheckpoints.ts so that module stays store-free.
 */
import { useRouteBuilderStore } from '../../../stores/routeBuilderStore';
import { popCheckpoint } from './editCheckpoints';
import type { RouteCheckpoint } from './editCheckpoints';

/**
 * Returns the restored stats (for the "Reverted — back to …" chat line),
 * or null when there is no checkpoint to restore.
 */
export function revertLastChatEdit(): RouteCheckpoint['stats'] | null {
  const checkpoint = popCheckpoint();
  if (!checkpoint) return null;

  const state = useRouteBuilderStore.getState();
  state.setRouteGeometry(checkpoint.geometry);
  state.setRouteStats(checkpoint.stats);
  return checkpoint.stats;
}
