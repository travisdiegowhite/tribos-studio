/**
 * Type Definitions Index
 * Re-exports all types for easy importing
 */

// Training types
export * from './training';

// Database types
export * from './database';

// Common type utilities
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Date utilities
export type ISODateString = string; // Format: YYYY-MM-DD
export type ISODateTimeString = string; // Format: YYYY-MM-DDTHH:mm:ss.sssZ

// ID types for clarity
export type UUID = string;
export type UserId = UUID;
export type PlanId = UUID;
export type WorkoutId = string; // Workout IDs from library are slugs, not UUIDs
export type ActivityId = UUID;
