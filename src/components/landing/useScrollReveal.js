import { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for scroll-triggered reveal animations.
 * Returns a ref to attach to the element and visibility state.
 * Respects prefers-reduced-motion.
 */
export function useScrollReveal({ threshold = 0.3, rootMargin = '0px', once = true } = {}) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Check reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setIsVisible(true);
      setHasBeenVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          setHasBeenVisible(true);
          if (once) {
            observer.unobserve(element);
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);
    return () => observer.unobserve(element);
  }, [threshold, rootMargin, once]);

  return { ref, isVisible, hasBeenVisible };
}

/**
 * Hook to track which section is currently active (for progress indicator).
 * Returns the index of the section currently most in view.
 */
export function useActiveSection(sectionCount) {
  const [activeIndex, setActiveIndex] = useState(0);
  const sectionRefs = useRef([]);

  const setSectionRef = useCallback((index) => (el) => {
    sectionRefs.current[index] = el;
  }, []);

  useEffect(() => {
    const observers = [];
    const visibilityMap = new Map();

    sectionRefs.current.forEach((el, index) => {
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          visibilityMap.set(index, entry.intersectionRatio);
          // Find the section with the highest visibility
          let maxRatio = 0;
          let maxIndex = 0;
          visibilityMap.forEach((ratio, idx) => {
            if (ratio > maxRatio) {
              maxRatio = ratio;
              maxIndex = idx;
            }
          });
          if (maxRatio > 0) {
            setActiveIndex(maxIndex);
          }
        },
        { threshold: [0, 0.25, 0.5, 0.75, 1] }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach(o => o.disconnect());
  }, [sectionCount]);

  return { activeIndex, setSectionRef, sectionRefs };
}

/**
 * Returns true if the user prefers reduced motion.
 */
export function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);

    const handler = (e) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
}
