import { useCallback } from 'react';

const SECTION_LABELS = ['Hero', 'Connect', 'Import', 'Analyze', 'Coach', 'Route', 'CTA'];

export default function ProgressIndicator({ activeIndex, sectionRefs }) {
  const handleClick = useCallback((index) => {
    const el = sectionRefs.current?.[index];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [sectionRefs]);

  return (
    <nav className="progress-indicator" aria-label="Page sections">
      {SECTION_LABELS.map((label, index) => {
        let className = 'progress-dot';
        if (index === activeIndex) {
          className += ' active';
        } else if (index < activeIndex) {
          className += ' passed';
        }

        return (
          <button
            key={label}
            className={className}
            onClick={() => handleClick(index)}
            aria-label={`Go to ${label} section`}
            title={label}
          />
        );
      })}
    </nav>
  );
}
