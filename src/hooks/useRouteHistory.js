/**
 * useRouteHistory - Hook for route undo/redo with keyboard shortcuts
 *
 * Provides undo/redo functionality for route builder edits.
 * - Cmd/Ctrl+Z: Undo
 * - Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y: Redo
 */

import { useEffect, useCallback } from 'react';
import { useRouteBuilderStore } from '../stores/routeBuilderStore';
import { notifications } from '@mantine/notifications';

/**
 * Hook to enable undo/redo for route editing with keyboard shortcuts
 * @param {Object} options - Configuration options
 * @param {boolean} options.enableKeyboard - Enable keyboard shortcuts (default: true)
 * @param {boolean} options.showNotifications - Show notifications on undo/redo (default: false)
 * @returns {Object} - Undo/redo functions and state
 */
export function useRouteHistory({ enableKeyboard = true, showNotifications = false } = {}) {
  const pushHistory = useRouteBuilderStore((state) => state.pushHistory);
  const undo = useRouteBuilderStore((state) => state.undo);
  const redo = useRouteBuilderStore((state) => state.redo);
  const canUndo = useRouteBuilderStore((state) => state.canUndo);
  const canRedo = useRouteBuilderStore((state) => state.canRedo);
  const getHistoryInfo = useRouteBuilderStore((state) => state.getHistoryInfo);
  const clearHistory = useRouteBuilderStore((state) => state.clearHistory);

  // Wrap undo with optional notification
  const handleUndo = useCallback(() => {
    if (!canUndo()) {
      if (showNotifications) {
        notifications.show({
          title: 'Nothing to undo',
          message: 'No previous route state available',
          color: 'gray',
          autoClose: 2000,
        });
      }
      return false;
    }

    const success = undo();
    if (success && showNotifications) {
      notifications.show({
        title: 'Undo',
        message: 'Route change undone',
        color: 'blue',
        autoClose: 2000,
      });
    }
    return success;
  }, [canUndo, undo, showNotifications]);

  // Wrap redo with optional notification
  const handleRedo = useCallback(() => {
    if (!canRedo()) {
      if (showNotifications) {
        notifications.show({
          title: 'Nothing to redo',
          message: 'No future route state available',
          color: 'gray',
          autoClose: 2000,
        });
      }
      return false;
    }

    const success = redo();
    if (success && showNotifications) {
      notifications.show({
        title: 'Redo',
        message: 'Route change redone',
        color: 'blue',
        autoClose: 2000,
      });
    }
    return success;
  }, [canRedo, redo, showNotifications]);

  // Keyboard shortcut handler
  useEffect(() => {
    if (!enableKeyboard) return;

    const handleKeyDown = (event) => {
      // Check for Cmd (Mac) or Ctrl (Windows/Linux)
      const isMod = event.metaKey || event.ctrlKey;
      if (!isMod) return;

      // Don't trigger if user is typing in an input
      const target = event.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Cmd/Ctrl + Z = Undo
      if (event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }

      // Cmd/Ctrl + Shift + Z = Redo (Mac style)
      if (event.key === 'z' && event.shiftKey) {
        event.preventDefault();
        handleRedo();
        return;
      }

      // Cmd/Ctrl + Y = Redo (Windows style)
      if (event.key === 'y') {
        event.preventDefault();
        handleRedo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboard, handleUndo, handleRedo]);

  return {
    // Actions
    pushHistory,
    undo: handleUndo,
    redo: handleRedo,
    clearHistory,

    // State getters (call these as functions)
    canUndo,
    canRedo,
    getHistoryInfo,
  };
}

export default useRouteHistory;
