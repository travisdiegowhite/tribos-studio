import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const CoachCommandBarContext = createContext(null);

export function CoachCommandBarProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [prefillQuery, setPrefillQuery] = useState(null);

  const open = useCallback((query = null) => {
    if (query) {
      setPrefillQuery(query);
    }
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setPrefillQuery(null);
  }, []);

  const clearPrefill = useCallback(() => {
    setPrefillQuery(null);
  }, []);

  // Global keyboard shortcut: Ctrl/Cmd + K
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          close();
        } else {
          open();
        }
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        close();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, open, close]);

  const value = {
    isOpen,
    open,
    close,
    prefillQuery,
    clearPrefill,
  };

  return (
    <CoachCommandBarContext.Provider value={value}>
      {children}
    </CoachCommandBarContext.Provider>
  );
}

export function useCoachCommandBar() {
  const context = useContext(CoachCommandBarContext);
  if (!context) {
    throw new Error('useCoachCommandBar must be used within CoachCommandBarProvider');
  }
  return context;
}

export default CoachCommandBarContext;
