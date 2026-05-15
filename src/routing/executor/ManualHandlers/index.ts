/**
 * ManualHandlers public API.
 *
 * The UI-driven path of the executor. One function,
 * `Promise<ExecutorResult>`, never throws.
 *
 * T2.4 ships this module with zero production callers. T2.5 (Executor
 * facade) wires it in.
 */

export { applyManualAction } from './ManualHandlers';
export {
  isAddWaypointPayload,
  isClearRoutePayload,
  isDragWaypointPayload,
  isRemoveWaypointPayload,
  isReverseRoutePayload,
} from './payloadValidation';
export type {
  AddWaypointPayload,
  ClearRoutePayload,
  DragWaypointPayload,
  RemoveWaypointPayload,
  ReverseRoutePayload,
} from './payloadValidation';
