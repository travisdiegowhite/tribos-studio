-- Migration 050: Add metadata column to gear_components
-- Stores component-type-specific data (tire width, tubeless, wheel rim width, etc.)
-- as JSONB to avoid adding sparse columns for each component type.

ALTER TABLE gear_components ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

COMMENT ON COLUMN gear_components.metadata IS 'Component-type-specific metadata. Tires: {width_mm, tubeless, max_pressure_psi}. Wheels: {rim_width_mm, hookless}.';
