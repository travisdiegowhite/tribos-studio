/**
 * A segmented choice built from native radio inputs inside a fieldset, so it
 * is a real form control: labelled by its legend, arrow-key navigable, and
 * read correctly by screen readers (spec acceptance: keyboard-usable,
 * Lighthouse accessibility ≥ 95).
 */

import { useId, type ReactNode } from 'react';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Accessible name when `label` is not plain text. */
  ariaLabel?: string;
}

interface Props<T extends string | number> {
  legend: string;
  name: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
  describedBy?: string;
}

export function Segmented<T extends string | number>({ legend, name, value, options, onChange, describedBy }: Props<T>) {
  const id = useId();
  return (
    <fieldset className="rl-field rl-segmented" aria-describedby={describedBy}>
      <legend className="rl-label">{legend}</legend>
      <div className="rl-segments">
        {options.map((o) => {
          const optId = `${id}-${o.value}`;
          return (
            <span key={String(o.value)} className="rl-segment">
              <input
                type="radio"
                id={optId}
                name={name}
                value={String(o.value)}
                checked={o.value === value}
                onChange={() => onChange(o.value)}
                aria-label={o.ariaLabel}
              />
              <label htmlFor={optId}>{o.label}</label>
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}
